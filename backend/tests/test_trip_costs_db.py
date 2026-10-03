"""Il costo FIFO arriva nelle righe dei viaggi lette dal database.

Vedi tests/test_trip_recording.py per come lanciarli.
"""

from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio

from app.db import Database

DSN = os.environ.get("TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(not DSN, reason="TEST_DATABASE_URL non impostata")

VIN = "TESTVIN0000000003"
T0 = datetime(2026, 9, 1, 8, 0, tzinfo=timezone.utc)


def at(hours: float) -> datetime:
    return T0 + timedelta(hours=hours)


@pytest_asyncio.fixture
async def db():
    database = Database(DSN)
    await database.connect()
    await database.pool.execute("DELETE FROM vehicle WHERE vin = $1", VIN)
    await database.ensure_vehicle(VIN)
    yield database
    await database.pool.execute("DELETE FROM vehicle WHERE vin = $1", VIN)
    await database.close()


async def add_trip(db: Database, start_h: float, end_h: float, liters: float) -> str:
    return await db.pool.fetchval(
        "INSERT INTO trip (vin, started_at, ended_at, fuel_used_l) VALUES ($1, $2, $3, $4) RETURNING id",
        VIN, at(start_h), at(end_h), liters,
    )


async def add_refuel(db: Database, hours: float, liters: float, price: float | None) -> None:
    # Livello prima 0%: il primo rifornimento a serbatoio vuoto non lascia
    # carburante d'origine sconosciuta davanti nella coda.
    refuel_id = await db.create_pending_refuel(VIN, at(hours), None, 0, 50, liters)
    if price is not None:
        await db.confirm_refuel(refuel_id, liters, round(liters * price, 2), False, None)


@pytest.mark.asyncio
async def test_list_and_detail_carry_fifo_cost(db):
    await add_refuel(db, 0, 20, 2.00)
    await add_trip(db, 1, 2, 15)
    await add_refuel(db, 3, 20, 2.10)
    last = await add_trip(db, 4, 5, 10)

    trips = {t["id"]: t for t in await db.list_trips(VIN, 50, 0)}
    assert trips[last]["cost_eur"] == pytest.approx(5 * 2.00 + 5 * 2.10)
    assert trips[last]["cost_uncovered_l"] == 0

    detail = await db.get_trip(last)
    assert detail["cost_eur"] == pytest.approx(20.50)


@pytest.mark.asyncio
async def test_page_cost_depends_on_trips_outside_the_page(db):
    """Solo l'ultimo viaggio nella pagina: il suo costo tiene conto dei precedenti."""
    await add_refuel(db, 0, 20, 2.00)
    await add_trip(db, 1, 2, 15)
    await add_refuel(db, 3, 20, 2.10)
    await add_trip(db, 4, 5, 10)

    [latest] = await db.list_trips(VIN, 1, 0)
    assert latest["cost_eur"] == pytest.approx(20.50)


@pytest.mark.asyncio
async def test_pending_refuel_is_uncovered_until_confirmed(db):
    await add_refuel(db, 0, 10, 2.00)
    await add_refuel(db, 1, 20, None)
    trip = await add_trip(db, 2, 3, 15)

    row = await db.get_trip(trip)
    assert row["cost_eur"] == pytest.approx(20.00)
    assert row["cost_uncovered_l"] == pytest.approx(5)
