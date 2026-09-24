"""Luoghi salvati, filtro per periodo, etichetta/nota e serbatoio del viaggio.

Come test_trip_recording.py: serve un Postgres/PostGIS con lo schema,
indirizzo in TEST_DATABASE_URL.
"""

from __future__ import annotations

import os
from datetime import timedelta

import pytest
import pytest_asyncio

from app.db import Database
from app.trips import TripRecorder
from tests.test_trip_recording import ROUTE, START, VIN

DSN = os.environ.get("TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(not DSN, reason="TEST_DATABASE_URL non impostata")


@pytest_asyncio.fixture
async def db():
    database = Database(DSN)
    await database.connect()
    await database.pool.execute("DELETE FROM vehicle WHERE vin = $1", VIN)
    await database.pool.execute("DELETE FROM place")
    await database.ensure_vehicle(VIN)
    yield database
    await database.pool.execute("DELETE FROM vehicle WHERE vin = $1", VIN)
    await database.pool.execute("DELETE FROM place")
    await database.close()


async def _drive(recorder: TripRecorder, start, *, fuel_start=40.0, fuel_end=38.0) -> None:
    await recorder.handle(
        VIN, {"ignitionstate": "4", "odo": 41000, "tanklevelpercent": fuel_start, "rangeliquid": 400}, start
    )
    for i, (lat, lon) in enumerate(ROUTE):
        await recorder.handle(
            VIN, {"ignitionstate": "4", "positionLat": lat, "positionLong": lon}, start + timedelta(minutes=i + 1)
        )
    await recorder.handle(
        VIN,
        {"ignitionstate": "0", "odo": 41003, "distanceStart": 3.0, "liquidconsumptionstart": 7.0,
         "tanklevelpercent": fuel_end, "rangeliquid": 385},
        start + timedelta(minutes=10),
    )


@pytest.mark.asyncio
async def test_trip_keeps_fuel_level_and_range_before_and_after(db):
    await _drive(TripRecorder(db), START)
    trip = (await db.list_trips(VIN, 1, 0))[0]
    assert trip["fuel_level_start_pct"] == 40.0
    assert trip["fuel_level_end_pct"] == 38.0
    assert trip["range_start_km"] == 400
    assert trip["range_end_km"] == 385


@pytest.mark.asyncio
async def test_saved_place_is_matched_within_its_radius(db):
    await _drive(TripRecorder(db), START)
    end_lat, end_lon = ROUTE[-1]
    # Circa 150 m dall'arrivo: dentro un raggio di 300 m, fuori da 100 m.
    near = await db.create_place("Lavoro", "work", "#e0a63c", end_lat + 0.00135, end_lon, 300)
    await db.create_place("Lontano", "pin", "#4F8FD1", end_lat + 0.00135, end_lon + 0.001, 100)
    home = await db.create_place("Casa", "home", "#4F8FD1", ROUTE[0][0], ROUTE[0][1], 200)

    trip = (await db.list_trips(VIN, 1, 0))[0]
    assert trip["end_place_id"] == near["id"]
    assert trip["start_place_id"] == home["id"]

    # Raggio ridotto: il viaggio passato non arriva piu' li'.
    await db.update_place(near["id"], {"radius_m": 100})
    trip = (await db.list_trips(VIN, 1, 0))[0]
    assert trip["end_place_id"] is None


@pytest.mark.asyncio
async def test_trips_can_be_filtered_by_period_without_route(db):
    recorder = TripRecorder(db)
    await _drive(recorder, START)
    await _drive(recorder, START + timedelta(days=3))

    trips = await db.list_trips(VIN, 50, 0, START + timedelta(days=1), None, with_route=False)
    assert len(trips) == 1
    assert trips[0]["route"] == []
    assert len(await db.list_trips(VIN, 50, 0, START, START + timedelta(days=1))) == 1


@pytest.mark.asyncio
async def test_tag_note_and_addresses_are_saved(db):
    await _drive(TripRecorder(db), START)
    trip_id = (await db.list_trips(VIN, 1, 0))[0]["id"]

    updated = await db.update_trip(trip_id, {"tag": "Lavoro", "note": "Consegna", "end_address": "Via Roma 1"})
    assert (updated["tag"], updated["note"], updated["end_address"]) == ("Lavoro", "Consegna", "Via Roma 1")

    cleared = await db.update_trip(trip_id, {"tag": None})
    assert cleared["tag"] is None and cleared["note"] == "Consegna"
