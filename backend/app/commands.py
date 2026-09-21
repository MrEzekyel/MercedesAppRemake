"""Costruzione dei comandi remoti (chiudi/apri porte, clima, luci).

Il formato esatto (quali campi impostare, cosa lasciare vuoto per "tutte le
porte", quali valori per i lampeggi) non e' documentato: ricalca 1:1 quello
usato da mbapi2020 (custom_components/mbapi2020/client.py, non vendorizzato
perche' vendor.sh importa solo i file elencati nel suo commento), verificato
leggendo il sorgente upstream.
"""

from __future__ import annotations

from .mbapi.proto import client_pb2

# Comandi supportati e il campo di CommandRequest che occupano.
LOCK = "lock"
UNLOCK = "unlock"
CLIMATE_START = "climate_start"
CLIMATE_STOP = "climate_stop"
LIGHTS = "lights"
HORN = "horn"
WINDOWS_OPEN = "windows_open"
WINDOWS_CLOSE = "windows_close"


def build(command: str, vin: str, request_id: str, *, pin: str = "") -> bytes:
    """Costruisce il ClientMessage serializzato per il comando dato."""
    msg = client_pb2.ClientMessage()
    msg.commandRequest.vin = vin
    msg.commandRequest.request_id = request_id

    if command == LOCK:
        msg.commandRequest.doors_lock.doors.extend([])
    elif command == UNLOCK:
        msg.commandRequest.doors_unlock.pin = pin
    elif command == CLIMATE_START:
        msg.commandRequest.auxheat_start.SetInParent()
    elif command == CLIMATE_STOP:
        msg.commandRequest.auxheat_stop.SetInParent()
    elif command == LIGHTS:
        # sigpos_type=LIGHT_ONLY (0), light_type=DIPPED_HEAD_LIGHT (1): lampeggio
        # di cortesia, niente clacson.
        msg.commandRequest.sigpos_start.sigpos_type = 0
        msg.commandRequest.sigpos_start.light_type = 1
    elif command == HORN:
        # sigpos_type=HORN_ONLY (1): stesso comando dei fari, ma col clacson.
        msg.commandRequest.sigpos_start.sigpos_type = 1
    elif command == WINDOWS_OPEN:
        msg.commandRequest.windows_open.pin = pin
    elif command == WINDOWS_CLOSE:
        msg.commandRequest.windows_close.SetInParent()
    else:
        raise ValueError(f"Comando sconosciuto: {command}")

    return msg.SerializeToString()
