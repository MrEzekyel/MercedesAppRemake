"""Servizio che ascolta l'auto e aggiorna il database.

Tiene aperto il websocket verso Mercedes, traduce gli eventi in stato del
veicolo e li passa al rilevatore di viaggi.
"""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from google.protobuf.json_format import MessageToDict

from . import commands
from . import mbapi  # noqa: F401  installa la compatibilita' Home Assistant
from .config import settings
from .db import Database
from .ha_compat import ConfigEntry, HomeAssistant, async_create_clientsession
from .events import IGNITION_ON, parse_update, parse_vehicle_status_update, position
from .mbapi.app_version import AppVersionManager
from .mbapi.errors import MBAuth2FAError, MBAuthError
from .mbapi.oauth import Oauth
from .mbapi.proto import client_pb2
from .mbapi.websocket import Websocket
from .refuel import RefuelDetector
from .trips import TripRecorder

# Stati terminali di AppTwinCommandStatus.state (vehicle_events.proto):
# 5=FINISHED, 6=FAILED. Gli altri (ENQUEUED, PROCESSING, WAITING_*, ...) sono
# intermedi: il comando resta "pending" finche' non arriva uno di questi due.
_COMMAND_FINISHED = 5
_COMMAND_FAILED = 6

LOGGER = logging.getLogger(__name__)

# 1 e 2 = chiusa, 0 e 3 = aperta.
_LOCKED_STATES = {1, 2}
_UNLOCKED_STATES = {0, 3}


class MercedesService:
    def __init__(self, db: Database) -> None:
        self._db = db
        self._trips = TripRecorder(db)
        self._refuel = RefuelDetector(db)
        self._hass = HomeAssistant()
        self._ignition_states: dict[str, bool] = {}
        self._websocket: Websocket | None = None

    async def start(self) -> None:
        entry = ConfigEntry.load(settings.token_path)
        entry.data.setdefault("username", settings.mb_username)
        entry.data.setdefault("password", settings.mb_password)
        entry.data.setdefault("region", settings.mb_region)

        app_version = AppVersionManager(settings.mb_region)
        session = async_create_clientsession(self._hass)
        oauth = Oauth(
            hass=self._hass,
            session=session,
            region=settings.mb_region,
            config_entry=entry,
            app_version=app_version,
        )

        # Il websocket si ri-autentica da solo dopo il primo login (es. sui
        # 429), ma non ne esegue mai uno da zero: senza questo, prova a usare
        # un token None e va in TypeError alla prima connessione.
        if await oauth.async_get_cached_token() is None:
            LOGGER.info("Nessun token salvato, eseguo il login...")
            try:
                await oauth.async_login_new(settings.mb_username, settings.mb_password)
            except MBAuth2FAError as exc:
                raise RuntimeError(
                    "Login rifiutato: l'account ha l'autenticazione a due fattori "
                    "attiva. Disattivala su Mercedes me (Profilo > Impostazioni > "
                    "Sicurezza) o usa un account dedicato senza MFA."
                ) from exc
            except MBAuthError as exc:
                raise RuntimeError(f"Login Mercedes fallito: {exc}") from exc
            LOGGER.info("Login riuscito, token salvato in %s", settings.token_path)

        self._websocket = Websocket(
            hass=self._hass,
            oauth=oauth,
            region=settings.mb_region,
            ignition_states=self._ignition_states,
            app_version=app_version,
        )
        LOGGER.info("Connessione al websocket Mercedes...")
        await self._websocket.async_connect(self._on_data)

    async def stop(self) -> None:
        if self._websocket:
            await self._websocket.async_stop()

    async def send_command(self, vin: str, command: str) -> uuid.UUID:
        """Invia un comando remoto (chiudi/apri, clima, luci) e lo registra.

        L'id generato qui e' anche il request_id mandato a Mercedes: la
        conferma/fallimento arriva in modo asincrono su un altro messaggio
        websocket (apptwin_command_status_updates_by_vin) e viene ricollegata
        a questa riga tramite quello stesso id in _handle_command_status.
        """
        if self._websocket is None:
            raise RuntimeError("Websocket non connesso")

        command_id = uuid.uuid4()
        message = commands.build(command, vin, str(command_id), pin=settings.mb_pin)
        await self._db.log_command(command_id, vin, command, {})
        await self._websocket.call(message, car_command=True)
        return command_id

    def _on_data(self, data: Any) -> Any:
        """Gestisce un messaggio dell'auto e restituisce l'acknowledgment.

        Il websocket vendorizzato (mbapi2020) chiama questo callback in modo
        sincrono e non lo awaita mai (vedi app/mbapi/websocket.py): definirlo
        `async def` fa si' che l'ack ritornato sia una coroutine mai eseguita
        invece del messaggio protobuf atteso. L'ack va quindi costruito qui in
        modo sincrono; le scritture su DB, che sono async, vengono schedulate
        come task separati cosi' l'ack parte subito. Mercedes smette di
        inviare aggiornamenti se non vengono confermati in tempo: l'ack del
        numero di sequenza non e' opzionale.
        """
        msg_type = data.WhichOneof("msg")
        ack = client_pb2.ClientMessage()

        # Mercedes manda gli aggiornamenti in due formati diversi a seconda
        # dell'account/veicolo: il vecchio vepUpdates (mappa generica di
        # attributi) e il nuovo vehicle_status_updates (campi tipizzati). Se
        # non gestiamo entrambi, i messaggi del formato non previsto vengono
        # scartati qui senza errori e senza ack, e l'auto smette di mandarne
        # altri: e' cosi' che il DB restava vuoto pur con websocket connesso.
        if msg_type == "vepUpdates":
            for vin, update in data.vepUpdates.updates.items():
                asyncio.create_task(self._handle_update_safe(vin, update, parse_update))
            ack.acknowledge_vep_updates_by_vin.sequence_number = data.vepUpdates.sequence_number
            return ack

        if msg_type == "vehicle_status_updates":
            for vin, update in data.vehicle_status_updates.vehicle_status_updates.items():
                asyncio.create_task(
                    self._handle_update_safe(vin, update, parse_vehicle_status_update)
                )
            ack.acknowledge_vehicle_status_updates.sequence_number = (
                data.vehicle_status_updates.sequence_number
            )
            return ack

        if msg_type == "apptwin_command_status_updates_by_vin":
            payload = data.apptwin_command_status_updates_by_vin
            for by_vin in payload.updates_by_vin.values():
                for status in by_vin.updates_by_pid.values():
                    asyncio.create_task(self._handle_command_status(status))
            ack.acknowledge_apptwin_command_status_update_by_vin.sequence_number = (
                payload.sequence_number
            )
            return ack

        return None

    async def _handle_command_status(self, status: Any) -> None:
        # Stati intermedi (ENQUEUED, PROCESSING, WAITING_*, ...): non e'
        # ancora il momento di aggiornare la riga, resta "pending".
        if status.state not in (_COMMAND_FINISHED, _COMMAND_FAILED):
            return
        try:
            command_id = uuid.UUID(status.request_id)
        except ValueError:
            # request_id non nostro (es. comando lanciato dall'app ufficiale
            # Mercedes Me): non c'e' una riga command_log da aggiornare.
            return
        if status.state == _COMMAND_FINISHED:
            await self._db.complete_command(command_id, "completed", None)
        else:
            error = status.errors.message or status.errors.code or "Comando rifiutato"
            await self._db.complete_command(command_id, "failed", error)

    async def _handle_update_safe(self, vin: str, update: Any, parser) -> None:
        try:
            await self._handle_update(vin, update, parser)
        except Exception:
            # Un evento malformato non deve interrompere lo stream: resta
            # in raw_event e possiamo rigiocarlo dopo aver corretto la logica.
            LOGGER.exception("Errore elaborando l'aggiornamento per %s", vin[-4:])

    async def _handle_update(self, vin: str, update: Any, parser) -> None:
        attrs = parser(update)
        ts = _timestamp(update)

        await self._db.ensure_vehicle(vin)
        await self._db.log_raw_event(vin, "vepUpdate", MessageToDict(update))

        # Deve girare prima di update_state: legge il livello carburante
        # precedente per confrontarlo col nuovo, e update_state lo sovrascrive.
        await self._refuel.handle(vin, attrs, ts)

        state = _state_fields(attrs)
        if state:
            await self._db.update_state(vin, state)

        coords = position(attrs)
        if coords:
            await self._db.update_position(vin, coords[0], coords[1], ts)

        if "ignitionstate" in attrs:
            self._ignition_states[vin] = str(attrs["ignitionstate"]) == IGNITION_ON

        await self._trips.handle(vin, attrs, ts)


    # Enum vehicle_events.proto (verificati con l'introspezione dei
    # descriptor protobuf, non documentati altrove).
_DOOR_STATUS = {0: "closed", 1: "open"}
_DOOR_STATUS_OVERALL = {0: "open", 1: "closed", 3: "unknown"}
_WINDOW_STATUS = {0: "intermediate", 1: "open", 2: "closed", 3: "airing"}
_WINDOW_STATUS_OVERALL = {0: "open", 1: "closed", 2: "open", 3: "airing"}
_HOOD_STATUS = {0: "closed", 1: "open"}

_OPENING_FIELDS = {
    "doorstatusfrontleft": ("door_front_left", _DOOR_STATUS),
    "doorstatusfrontright": ("door_front_right", _DOOR_STATUS),
    "doorstatusrearleft": ("door_rear_left", _DOOR_STATUS),
    "doorstatusrearright": ("door_rear_right", _DOOR_STATUS),
    "door_status_overall": ("doors_overall", _DOOR_STATUS_OVERALL),
    "windowstatusfrontleft": ("window_front_left", _WINDOW_STATUS),
    "windowstatusfrontright": ("window_front_right", _WINDOW_STATUS),
    "windowstatusrearleft": ("window_rear_left", _WINDOW_STATUS),
    "windowstatusrearright": ("window_rear_right", _WINDOW_STATUS),
    "window_status_overall": ("windows_overall", _WINDOW_STATUS_OVERALL),
    "engine_hood_status": ("hood", _HOOD_STATUS),
}

_TIRE_PRESSURE_FIELDS = {
    "tirepressure_front_left": "front_left",
    "tirepressure_front_right": "front_right",
    "tirepressure_rear_left": "rear_left",
    "tirepressure_rear_right": "rear_right",
}

# BoolAttribute: True quando la spia e' accesa (== c'e' qualcosa da segnalare).
_WARNING_FIELDS = {
    "warningbrakefluid": "brake_fluid",
    "warningcoolantlevellow": "coolant_low",
    "warningenginelight": "engine_light",
    "warningwashwater": "washer_fluid",
    "warningbrakeliningwear": "brake_pad_wear",
}


def _state_fields(attrs: dict[str, Any]) -> dict[str, Any]:
    """Traduce gli attributi noti in colonne di vehicle_state.

    Solo quelli di cui conosciamo la semantica: il resto resta in raw_event,
    da cui possiamo recuperarlo quando capiamo cosa significa.
    """
    fields: dict[str, Any] = {}

    if (odo := _int(attrs.get("odo"))) is not None:
        fields["odometer_km"] = odo
    if (fuel := _float(attrs.get("tanklevelpercent"))) is not None:
        fields["fuel_level_pct"] = fuel
    if (rng := _int(attrs.get("rangeliquid"))) is not None:
        fields["range_km"] = rng
    if (heading := _float(attrs.get("positionHeading"))) is not None:
        fields["heading"] = heading
    if "ignitionstate" in attrs:
        fields["ignition_state"] = str(attrs["ignitionstate"])
        fields["engine_running"] = str(attrs["ignitionstate"]) == IGNITION_ON
    if (lock := _int(attrs.get("doorlockstatusvehicle"))) is not None:
        if lock in _LOCKED_STATES:
            fields["doors_locked"] = True
        elif lock in _UNLOCKED_STATES:
            fields["doors_locked"] = False
    if (brake := attrs.get("parkbrakestatus")) is not None:
        fields["park_brake_engaged"] = _int(brake) == 1

    openings: dict[str, str] = {}
    for attr_name, (key, labels) in _OPENING_FIELDS.items():
        code = _int(attrs.get(attr_name))
        if code is not None and code in labels:
            openings[key] = labels[code]
    if openings:
        fields["openings"] = json.dumps(openings)

    tire_pressures: dict[str, float] = {}
    for attr_name, wheel in _TIRE_PRESSURE_FIELDS.items():
        bar = _float(attrs.get(attr_name))
        if bar is not None:
            # value e' in centibar (verificato confrontando col displayValue
            # gia' arrotondato che manda l'auto: 205 -> "2.0 bar").
            tire_pressures[wheel] = round(bar / 100, 2)
    if tire_pressures:
        fields["tire_pressures"] = json.dumps(tire_pressures)

    warnings: dict[str, bool] = {}
    for attr_name, key in _WARNING_FIELDS.items():
        if attr_name in attrs and isinstance(attrs[attr_name], bool):
            warnings[key] = attrs[attr_name]
    if warnings:
        fields["warnings"] = json.dumps(warnings)

    eco_score: dict[str, float] = {}
    if (v := _float(attrs.get("ecoscoreaccel"))) is not None:
        eco_score["accel"] = v
    if (v := _float(attrs.get("ecoscoreconst"))) is not None:
        eco_score["const"] = v
    if (v := _float(attrs.get("ecoscorefreewhl"))) is not None:
        eco_score["freewheel"] = v
    if (v := _float(attrs.get("ecoscorebonusrange"))) is not None:
        eco_score["bonus_range_km"] = v
    if eco_score:
        fields["eco_score"] = json.dumps(eco_score)

    if (days := _int(attrs.get("serviceintervaldays"))) is not None:
        fields["service_interval_days"] = days

    return fields


def _timestamp(update: Any) -> datetime:
    ms = getattr(update, "emit_timestamp_in_ms", 0)
    if ms:
        return datetime.fromtimestamp(ms / 1000, tz=timezone.utc)
    seconds = getattr(update, "emit_timestamp", 0)
    if seconds:
        return datetime.fromtimestamp(seconds, tz=timezone.utc)
    return datetime.now(tz=timezone.utc)


def _int(value: Any) -> int | None:
    try:
        return int(value) if value is not None else None
    except (TypeError, ValueError):
        return None


def _float(value: Any) -> float | None:
    try:
        return float(value) if value is not None else None
    except (TypeError, ValueError):
        return None
