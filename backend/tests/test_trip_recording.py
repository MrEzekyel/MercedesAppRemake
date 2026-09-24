"""Test di integrazione del rilevamento viaggi contro un Postgres/PostGIS vero.

Simula lo stream di eventi di un viaggio (accensione, marcia, spegnimento) e
verifica che ne esca un viaggio corretto. Serve un database con lo schema
applicato; l'indirizzo si passa con TEST_DATABASE_URL.

    docker compose up -d
    TEST_DATABASE_URL=postgresql://mbcompanion:mbcompanion@localhost:5432/mbcompanion \
        .venv/bin/python -m pytest tests/ -v
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio
from google.protobuf.json_format import MessageToDict

from app import mbapi  # noqa: F401  installa la compatibilita' Home Assistant
from app.db import Database
from app.mbapi.proto import vehicle_events_pb2
from app.replay_trips import replay
from app.trips import TripRecorder

DSN = os.environ.get("TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(not DSN, reason="TEST_DATABASE_URL non impostata")

VIN = "TESTVIN0000000001"
START = datetime(2026, 3, 1, 8, 0, tzinfo=timezone.utc)

# Punti lungo un tragitto reale, circa 3 km verso nord-est a Milano.
ROUTE = [
    (45.4642, 9.1900),
    (45.4700, 9.1950),
    (45.4760, 9.2000),
    (45.4820, 9.2060),
]


@pytest_asyncio.fixture
async def db():
    database = Database(DSN)
    await database.connect()
    await database.pool.execute("DELETE FROM vehicle WHERE vin = $1", VIN)
    await database.ensure_vehicle(VIN)
    yield database
    await database.pool.execute("DELETE FROM vehicle WHERE vin = $1", VIN)
    await database.close()


async def _drive(recorder: TripRecorder, *, distance_km: float, consumption: float) -> None:
    """Accensione, percorso, spegnimento."""
    await recorder.handle(VIN, {"ignitionstate": "4", "odo": 41000}, START)

    for i, (lat, lon) in enumerate(ROUTE):
        await recorder.handle(
            VIN,
            {"ignitionstate": "4", "positionLat": lat, "positionLong": lon, "odo": 41000 + i},
            START + timedelta(minutes=i + 1),
        )

    await recorder.handle(
        VIN,
        {
            "ignitionstate": "0",
            "odo": 41000 + int(distance_km),
            "distanceStart": distance_km,
            "liquidconsumptionstart": consumption,
            "averageSpeedStart": 42.0,
        },
        START + timedelta(minutes=10),
    )


@pytest.mark.asyncio
async def test_records_a_complete_trip(db):
    await _drive(TripRecorder(db), distance_km=12.0, consumption=7.5)

    trips = await db.list_trips(VIN, limit=10, offset=0)
    assert len(trips) == 1

    trip = trips[0]
    assert trip["ended_at"] is not None
    assert float(trip["distance_effective_km"]) == 12.0
    assert trip["duration_s"] == 600
    # 12 km a 7,5 L/100km = 0,9 litri.
    assert float(trip["fuel_used_l"]) == pytest.approx(0.9, abs=0.01)
    assert float(trip["l_per_100km"]) == pytest.approx(7.5, abs=0.01)
    assert float(trip["km_per_l"]) == pytest.approx(13.33, abs=0.01)


@pytest.mark.asyncio
async def test_route_is_materialised(db):
    await _drive(TripRecorder(db), distance_km=12.0, consumption=7.5)

    trip_id = (await db.list_trips(VIN, 1, 0))[0]["id"]
    detail = await db.get_trip(trip_id)

    assert len(detail["route"]) == len(ROUTE)
    # GeoJSON usa l'ordine longitudine, latitudine.
    assert detail["route"][0] == pytest.approx([ROUTE[0][1], ROUTE[0][0]], abs=1e-6)
    # La traccia GPS misura circa 3 km, indipendente dal contatore di bordo.
    assert 2.0 < float(detail["distance_gps_km"]) < 4.0


@pytest.mark.asyncio
async def test_gps_distance_is_used_when_car_reports_none(db):
    """Se l'auto non manda i contatori, la distanza arriva comunque dal GPS."""
    recorder = TripRecorder(db)
    await recorder.handle(VIN, {"ignitionstate": "4", "odo": 41000}, START)
    for i, (lat, lon) in enumerate(ROUTE):
        await recorder.handle(
            VIN,
            {"ignitionstate": "4", "positionLat": lat, "positionLong": lon},
            START + timedelta(minutes=i + 1),
        )
    await recorder.handle(VIN, {"ignitionstate": "0"}, START + timedelta(minutes=10))

    trip = (await db.list_trips(VIN, 1, 0))[0]
    assert trip["distance_km"] is None if "distance_km" in trip else True
    assert 2.0 < float(trip["distance_effective_km"]) < 4.0


@pytest.mark.asyncio
async def test_only_one_trip_open_at_a_time(db):
    """Accensioni ripetute non devono aprire viaggi sovrapposti."""
    recorder = TripRecorder(db)
    for i in range(3):
        await recorder.handle(
            VIN, {"ignitionstate": "4", "odo": 41000}, START + timedelta(seconds=i)
        )

    open_trips = await db.pool.fetchval(
        "SELECT count(*) FROM trip WHERE vin = $1 AND ended_at IS NULL", VIN
    )
    assert open_trips == 1


@pytest.mark.asyncio
async def test_missing_ignition_does_not_close_trip(db):
    """Gli eventi parziali non devono chiudere un viaggio in corso.

    La maggior parte degli aggiornamenti non include l'accensione: trattare
    l'assenza come spegnimento troncherebbe i viaggi a meta' strada.
    """
    recorder = TripRecorder(db)
    await recorder.handle(VIN, {"ignitionstate": "4", "odo": 41000}, START)
    await recorder.handle(VIN, {"tanklevelpercent": 55.0}, START + timedelta(minutes=1))

    assert await db.get_open_trip(VIN) is not None


@pytest.mark.asyncio
async def test_stationary_points_are_not_recorded(db):
    """Da fermi non si accumulano punti nello stesso posto."""
    recorder = TripRecorder(db)
    await recorder.handle(VIN, {"ignitionstate": "4", "odo": 41000}, START)

    lat, lon = ROUTE[0]
    for i in range(5):
        await recorder.handle(
            VIN,
            {"ignitionstate": "4", "positionLat": lat, "positionLong": lon},
            START + timedelta(minutes=i + 1),
        )

    trip = await db.get_open_trip(VIN)
    points = await db.pool.fetchval(
        "SELECT count(*) FROM trip_point WHERE trip_id = $1", trip["id"]
    )
    assert points == 1


# --- Contatori "da partenza" che non si azzerano a ogni viaggio -------------
#
# L'auto azzera distanceStart / liquidconsumptionstart solo dopo circa 4 ore
# di sosta: due viaggi ravvicinati li accumulano. E i messaggi portano solo i
# campi cambiati, quindi consumo e distanza possono arrivare in messaggi
# diversi, anche dopo lo spegnimento.


async def _trip(recorder, start, end_msg, *, open_msg=None, minutes=15):
    await recorder.handle(VIN, open_msg or {"ignitionstate": "4"}, start)
    await recorder.handle(VIN, end_msg, start + timedelta(minutes=minutes))


@pytest.mark.asyncio
async def test_second_trip_counts_only_its_own_distance(db):
    """Il caso reale: 6,9 km, sosta di un'ora e mezza, altri 11,4 km. A fine
    secondo viaggio l'auto riporta 18,3 km da partenza (la somma)."""
    recorder = TripRecorder(db)
    await _trip(
        recorder, START,
        {"ignitionstate": "0", "distanceStart": 6.9, "liquidconsumptionstart": 7.0, "odo": 118257},
        open_msg={"ignitionstate": "4", "distanceStart": 0.0, "odo": 118250},
    )
    await _trip(
        recorder, START + timedelta(minutes=90),
        {"ignitionstate": "0", "distanceStart": 18.3, "liquidconsumptionstart": 7.5, "odo": 118268},
    )

    first, second = sorted(await db.list_trips(VIN, 10, 0), key=lambda t: t["started_at"])
    assert float(first["distance_effective_km"]) == pytest.approx(6.9)
    assert float(second["distance_effective_km"]) == pytest.approx(11.4)
    # 18,3 km a 7,5 = 1,3725 l in tutto, di cui 0,483 l nel primo viaggio.
    assert float(second["fuel_used_l"]) == pytest.approx(0.89, abs=0.01)
    assert second["odometer_start"] == 118257


@pytest.mark.asyncio
async def test_counter_reset_between_trips_is_detected(db):
    """Dopo una lunga sosta l'auto riparte da zero: sottrarre il valore del
    viaggio precedente darebbe 11,4 - 6,9 = 4,5 km. Il contachilometri
    (+11 km) dice quale lettura e' giusta."""
    recorder = TripRecorder(db)
    await _trip(
        recorder, START,
        {"ignitionstate": "0", "distanceStart": 6.9, "odo": 41007},
        open_msg={"ignitionstate": "4", "odo": 41000},
    )
    await _trip(
        recorder, START + timedelta(hours=6),
        {"ignitionstate": "0", "distanceStart": 11.4, "odo": 41018},
    )

    latest = (await db.list_trips(VIN, 1, 0))[0]
    assert float(latest["distance_effective_km"]) == pytest.approx(11.4)


@pytest.mark.asyncio
async def test_consumption_arriving_after_ignition_off_is_used(db):
    """Il messaggio di spegnimento porta la distanza ma non il consumo, che
    arriva pochi secondi dopo in un messaggio separato."""
    recorder = TripRecorder(db)
    await _trip(
        recorder, START,
        {"ignitionstate": "0", "distanceStart": 12.0, "odo": 41012},
        open_msg={"ignitionstate": "4", "distanceStart": 0.0, "odo": 41000},
    )
    await recorder.handle(
        VIN, {"liquidconsumptionstart": 6.0, "drivenTimeStart": 20},
        START + timedelta(minutes=15, seconds=5),
    )

    trip = (await db.list_trips(VIN, 1, 0))[0]
    assert float(trip["fuel_used_l"]) == pytest.approx(0.72, abs=0.01)
    assert float(trip["avg_speed_kmh"]) == pytest.approx(36.0, abs=0.1)


@pytest.mark.asyncio
async def test_replay_rebuilds_trips_from_raw_events(db):
    """I viaggi registrati con la logica vecchia si ricalcolano dai messaggi
    salvati: qui un viaggio con consumo arrivato dopo lo spegnimento, nel
    formato VehicleStatusUpdate che l'auto usa oggi."""
    def status(**fields):
        update = vehicle_events_pb2.VehicleStatusUpdate()
        for name, value in fields.items():
            getattr(update, name).value = value
        return MessageToDict(update)

    messages = [
        (START, status(ignitionstate=4, distance_start=0.0, odo=41000)),
        (START + timedelta(minutes=20), status(ignitionstate=0, distance_start=12.0, odo=41012)),
        (START + timedelta(minutes=20, seconds=4), status(liquidconsumptionstart=6.0, driven_time_start=20)),
    ]
    for ts, payload in messages:
        await db.pool.execute(
            "INSERT INTO raw_event (vin, received_at, event_type, payload) VALUES ($1, $2, 'vepUpdate', $3)",
            VIN, ts, json.dumps(payload),
        )
    # Un viaggio sbagliato gia' registrato, che il replay deve sostituire.
    await db.open_trip(VIN, START, None)

    try:
        await replay(db, START)
        trips = await db.list_trips(VIN, 10, 0)
        assert len(trips) == 1
        assert float(trips[0]["distance_effective_km"]) == pytest.approx(12.0)
        assert float(trips[0]["fuel_used_l"]) == pytest.approx(0.72, abs=0.01)
        assert float(trips[0]["avg_speed_kmh"]) == pytest.approx(36.0, abs=0.1)
    finally:
        await db.pool.execute("DELETE FROM raw_event WHERE vin = $1", VIN)
