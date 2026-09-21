"""Servizio che ascolta l'auto e aggiorna il database.

Tiene aperto il websocket verso Mercedes, traduce gli eventi in stato del
veicolo e li passa al rilevatore di viaggi.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from google.protobuf.json_format import MessageToDict

from . import mbapi  # noqa: F401  installa la compatibilita' Home Assistant
from .config import settings
from .db import Database
from .ha_compat import ConfigEntry, HomeAssistant, async_create_clientsession
from .events import IGNITION_ON, parse_update, position
from .mbapi.app_version import AppVersionManager
from .mbapi.oauth import Oauth
from .mbapi.proto import client_pb2
from .mbapi.websocket import Websocket
from .trips import TripRecorder

LOGGER = logging.getLogger(__name__)

# 1 e 2 = chiusa, 0 e 3 = aperta.
_LOCKED_STATES = {1, 2}
_UNLOCKED_STATES = {0, 3}


class MercedesService:
    def __init__(self, db: Database) -> None:
        self._db = db
        self._trips = TripRecorder(db)
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

    async def _on_data(self, data: Any) -> Any:
        """Gestisce un messaggio dell'auto e restituisce l'acknowledgment.

        Mercedes smette di inviare aggiornamenti se non vengono confermati:
        l'ack del numero di sequenza non e' opzionale.
        """
        msg_type = data.WhichOneof("msg")
        if msg_type != "vepUpdates":
            return None

        for vin, update in data.vepUpdates.updates.items():
            try:
                await self._handle_update(vin, update)
            except Exception:
                # Un evento malformato non deve interrompere lo stream: resta
                # in raw_event e possiamo rigiocarlo dopo aver corretto la logica.
                LOGGER.exception("Errore elaborando l'aggiornamento per %s", vin[-4:])

        ack = client_pb2.ClientMessage()
        ack.acknowledge_vep_updates_by_vin.sequence_number = data.vepUpdates.sequence_number
        return ack

    async def _handle_update(self, vin: str, update: Any) -> None:
        attrs = parse_update(update)
        ts = _timestamp(update)

        await self._db.ensure_vehicle(vin)
        await self._db.log_raw_event(vin, "vepUpdate", MessageToDict(update))

        state = _state_fields(attrs)
        if state:
            await self._db.update_state(vin, state)

        coords = position(attrs)
        if coords:
            await self._db.update_position(vin, coords[0], coords[1], ts)

        if "ignitionstate" in attrs:
            self._ignition_states[vin] = str(attrs["ignitionstate"]) == IGNITION_ON

        await self._trips.handle(vin, attrs, ts)


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
