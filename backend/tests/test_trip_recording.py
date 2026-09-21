"""Test di integrazione del rilevamento viaggi contro un Postgres/PostGIS vero.

Simula lo stream di eventi di un viaggio (accensione, marcia, spegnimento) e
verifica che ne esca un viaggio corretto. Serve un database con lo schema
applicato; l'indirizzo si passa con TEST_DATABASE_URL.

    docker compose up -d
    TEST_DATABASE_URL=postgresql://mbcompanion:mbcompanion@localhost:5432/mbcompanion \
        .venv/bin/python -m pytest tests/ -v
"""

from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio

from app.db import Database
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
