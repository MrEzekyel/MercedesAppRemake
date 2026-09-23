"""Il websocket deve riconnettersi dopo che mbapi2020 chiude la connessione.

La libreria chiude di proposito il websocket dopo 30s senza messaggi ad auto
spenta e programma una riconnessione 60s dopo. Quella riconnessione parte
solo se il websocket risulta registrato come in Home Assistant: senza la
registrazione il backend restava sordo dopo il primo minuto e nessun
viaggio veniva mai registrato.
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.ha_compat import ConfigEntry, HomeAssistant
from app.mbapi.websocket import Websocket
from app.service import register_websocket


def _websocket(hass: HomeAssistant, entry: ConfigEntry) -> Websocket:
    oauth = SimpleNamespace(_config_entry=entry)
    return Websocket(hass=hass, oauth=oauth, region="Europe")


@pytest.mark.asyncio
async def test_reconnect_attempt_connects_when_registered():
    hass, entry = HomeAssistant(), ConfigEntry({})
    ws = _websocket(hass, entry)
    register_websocket(hass, entry, ws)
    ws._async_connect_internal = AsyncMock()

    await ws._reconnect_attempt()
    ws._reconnectwatchdog.cancel()

    ws._async_connect_internal.assert_awaited_once()


@pytest.mark.asyncio
async def test_unregistered_websocket_never_reconnects():
    """Documenta il guasto: e' questo che succedeva prima della registrazione."""
    hass, entry = HomeAssistant(), ConfigEntry({})
    ws = _websocket(hass, entry)
    ws._async_connect_internal = AsyncMock()

    await ws._reconnect_attempt()

    ws._async_connect_internal.assert_not_awaited()
