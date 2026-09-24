"""Ricostruisce i viaggi da un istante in poi rigiocando i messaggi in raw_event.

Serve dopo una correzione della logica dei viaggi: i messaggi dell'auto sono
salvati per intero, quindi i viaggi gia' registrati si possono ricalcolare.
Cancella i viaggi iniziati da quell'istante in poi e li rifa' da capo.

    python -m app.replay_trips 2026-09-23T12:00:00+00:00
"""

from __future__ import annotations

import asyncio
import json
import sys
from datetime import datetime
from typing import Any

from google.protobuf.json_format import ParseDict

from . import mbapi  # noqa: F401  installa la compatibilita' Home Assistant
from .config import settings
from .db import Database
from .events import parse_update, parse_vehicle_status_update
from .mbapi.proto import vehicle_events_pb2
from .trips import TripRecorder


def attrs_from_payload(payload: dict[str, Any]) -> dict[str, Any]:
    """Riporta un messaggio salvato allo stesso dizionario visto dal vivo.

    I due formati Mercedes finiscono entrambi in raw_event: il vecchio
    VEPUpdate ha la mappa "attributes", il nuovo VehicleStatusUpdate i campi
    tipizzati.
    """
    if "attributes" in payload:
        message = ParseDict(payload, vehicle_events_pb2.VEPUpdate(), ignore_unknown_fields=True)
        return parse_update(message)
    message = ParseDict(payload, vehicle_events_pb2.VehicleStatusUpdate(), ignore_unknown_fields=True)
    return parse_vehicle_status_update(message)


async def replay(db: Database, since: datetime) -> int:
    """Rifa' i viaggi iniziati da `since` in poi; restituisce i messaggi rigiocati."""
    await db.pool.execute("DELETE FROM trip WHERE started_at >= $1", since)
    rows = await db.pool.fetch(
        "SELECT vin, received_at, payload FROM raw_event WHERE received_at >= $1 ORDER BY received_at, id",
        since,
    )
    recorder = TripRecorder(db)
    for row in rows:
        payload = row["payload"]
        if isinstance(payload, str):
            payload = json.loads(payload)
        # Il formato nuovo non ha un orario proprio: dal vivo vale l'istante
        # di arrivo, che e' quello salvato qui.
        await recorder.handle(row["vin"], attrs_from_payload(payload), row["received_at"])
    return len(rows)


async def _main(since: datetime) -> None:
    db = Database(settings.asyncpg_dsn)
    await db.connect()
    try:
        count = await replay(db, since)
        print(f"Rigiocati {count} messaggi dal {since.isoformat()}")
        for trip in reversed(await db.list_trips(None, 50, 0)):
            if trip["started_at"] < since:
                continue
            print(
                f"{trip['started_at']:%d/%m %H:%M}  {trip['distance_effective_km']} km  "
                f"{trip['fuel_used_l']} l  {trip['avg_speed_kmh']} km/h"
            )
    finally:
        await db.close()


if __name__ == "__main__":
    asyncio.run(_main(datetime.fromisoformat(sys.argv[1])))
