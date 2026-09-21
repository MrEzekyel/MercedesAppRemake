"""Compatibilita' Home Assistant per il codice importato da mbapi2020.

I moduli in app/mbapi sono copiati da un'integrazione Home Assistant e ne
importano alcuni simboli. Invece di modificarli (47 punti, e ogni
aggiornamento upstream diventerebbe un merge a mano) registriamo qui dei
moduli `homeassistant.*` finti in sys.modules.

Due categorie di simboli:

- quelli che servono davvero -- sessioni aiohttp, persistenza del token,
  eccezioni, spegnimento -- implementati sul serio piu' sotto;
- quelli usati solo nelle tabelle di entita' di const.py, che non leggiamo
  mai: segnaposto che devono soltanto non far esplodere l'import.

install() va chiamata prima di importare qualunque modulo di app.mbapi.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from types import ModuleType
from typing import Any

import aiohttp


class _Placeholder:
    """Namespace i cui attributi sono stringhe: Platform.SENSOR -> 'sensor'."""

    def __init__(self, name: str) -> None:
        self._name = name

    def __getattr__(self, item: str) -> str:
        if item.startswith("_"):
            raise AttributeError(item)
        return item.lower()

    def __call__(self, *args: Any, **kwargs: Any) -> Any:
        return args[0] if args else None


class HomeAssistantError(Exception):
    """Base delle eccezioni sollevate dal codice importato."""


class ConfigEntryAuthFailed(HomeAssistantError):
    """Credenziali rifiutate: richiede un nuovo login."""


class ConfigEntry:
    """Sostituto del contenitore di configurazione di Home Assistant.

    oauth.py lo usa solo come archivio del token: legge data["token"] e lo
    riscrive dopo ogni refresh. Qui la scrittura finisce su un file JSON.
    """

    def __init__(self, data: dict[str, Any], path: Path | None = None) -> None:
        self.data = data
        self.entry_id = "mb-companion"
        self._path = path

    def persist(self) -> None:
        if self._path is None:
            return
        self._path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self._path.with_suffix(".tmp")
        tmp.write_text(json.dumps(self.data, indent=2))
        # Rinomina atomica: un crash a meta' scrittura non lascia un token
        # troncato, che costringerebbe a rifare il login.
        tmp.replace(self._path)
        self._path.chmod(0o600)

    @classmethod
    def load(cls, path: Path) -> ConfigEntry:
        data = json.loads(path.read_text()) if path.exists() else {}
        return cls(data, path)


class _ConfigEntries:
    def async_update_entry(self, entry: ConfigEntry, data: dict[str, Any]) -> None:
        entry.data = data
        entry.persist()

    def async_schedule_reload(self, entry_id: str) -> None:
        # Upstream chiede a Home Assistant di ricaricare l'integrazione dopo un
        # fallimento di autenticazione. Qui il riavvio e' gestito dal loop di
        # riconnessione del servizio, quindi non c'e' niente da fare.
        return


class _Bus:
    def async_listen_once(self, event: str, handler: Any) -> Any:
        return lambda: None


class HomeAssistant:
    """Superficie minima dell'oggetto `hass` usata dal codice importato."""

    def __init__(self) -> None:
        self.data: dict[str, Any] = {}
        self.bus = _Bus()
        self.config_entries = _ConfigEntries()


def async_get_clientsession(hass: HomeAssistant, verify_ssl: bool = True) -> aiohttp.ClientSession:
    """Sessione condivisa, creata alla prima richiesta.

    Home Assistant ne tiene una per istanza; replichiamo il comportamento
    perche' il websocket si aspetta di riusare la stessa connessione.
    """
    session = hass.data.get("_shared_session")
    if session is None or session.closed:
        connector = aiohttp.TCPConnector(ssl=None if verify_ssl else False)
        session = aiohttp.ClientSession(connector=connector)
        hass.data["_shared_session"] = session
    return session


def async_create_clientsession(
    hass: HomeAssistant, verify_ssl: bool = True, cookie_jar: Any = None, **kwargs: Any
) -> aiohttp.ClientSession:
    """Sessione nuova e isolata: il login ha bisogno del proprio cookie jar."""
    connector = aiohttp.TCPConnector(ssl=None if verify_ssl else False)
    return aiohttp.ClientSession(connector=connector, cookie_jar=cookie_jar, **kwargs)


def _module(name: str, **attrs: Any) -> ModuleType:
    mod = ModuleType(name)
    for key, value in attrs.items():
        setattr(mod, key, value)
    sys.modules[name] = mod
    return mod


def install() -> None:
    """Registra i moduli homeassistant.* finti. Idempotente."""
    if "homeassistant" in sys.modules:
        return

    _module("homeassistant")
    _module("homeassistant.core", HomeAssistant=HomeAssistant, callback=lambda f: f)
    _module(
        "homeassistant.exceptions",
        HomeAssistantError=HomeAssistantError,
        ConfigEntryAuthFailed=ConfigEntryAuthFailed,
        ServiceValidationError=HomeAssistantError,
    )
    _module("homeassistant.config_entries", ConfigEntry=ConfigEntry)
    _module(
        "homeassistant.helpers.aiohttp_client",
        async_get_clientsession=async_get_clientsession,
        async_create_clientsession=async_create_clientsession,
    )

    # Solo tabelle di entita': mai lette da noi.
    _module(
        "homeassistant.const",
        EVENT_HOMEASSISTANT_STOP="homeassistant_stop",
        STATE_UNKNOWN="unknown",
        PERCENTAGE="%",
        EntityCategory=_Placeholder("EntityCategory"),
        Platform=_Placeholder("Platform"),
        UnitOfEnergy=_Placeholder("UnitOfEnergy"),
        UnitOfEnergyDistance=_Placeholder("UnitOfEnergyDistance"),
        UnitOfLength=_Placeholder("UnitOfLength"),
        UnitOfMass=_Placeholder("UnitOfMass"),
        UnitOfPower=_Placeholder("UnitOfPower"),
        UnitOfPressure=_Placeholder("UnitOfPressure"),
        UnitOfSpeed=_Placeholder("UnitOfSpeed"),
        UnitOfTemperature=_Placeholder("UnitOfTemperature"),
        UnitOfVolume=_Placeholder("UnitOfVolume"),
    )
    _module("homeassistant.components")
    _module("homeassistant.components.sensor", SensorDeviceClass=_Placeholder("SensorDeviceClass"), SensorStateClass=_Placeholder("SensorStateClass"))
    _module("homeassistant.components.binary_sensor", BinarySensorDeviceClass=_Placeholder("BinarySensorDeviceClass"))
    helpers = _module("homeassistant.helpers", config_validation=_Placeholder("cv"))
    helpers.aiohttp_client = sys.modules["homeassistant.helpers.aiohttp_client"]
    sys.modules["homeassistant"].helpers = helpers
    sys.modules["homeassistant"].components = sys.modules["homeassistant.components"]
