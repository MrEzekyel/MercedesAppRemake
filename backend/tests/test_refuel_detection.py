"""Test di integrazione del rilevamento rifornimenti.

Vedi tests/test_trip_recording.py per come lanciarli.
"""

from __future__ import annotations

import os
from datetime import datetime, timezone

import pytest
import pytest_asyncio

from app.db import Database
from app.refuel import RefuelDetector

DSN = os.environ.get("TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(not DSN, reason="TEST_DATABASE_URL non impostata")

VIN = "TESTVIN0000000002"
NOW = datetime(2026, 3, 1, 12, 0, tzinfo=timezone.utc)


@pytest_asyncio.fixture
async def db():
    database = Database(DSN)
    await database.connect()
    await database.pool.execute("DELETE FROM vehicle WHERE vin = $1", VIN)
    await database.ensure_vehicle(VIN)
    yield database
    await database.pool.execute("DELETE FROM vehicle WHERE vin = $1", VIN)
    await database.close()


@pytest.mark.asyncio
async def test_large_jump_creates_pending_refuel(db):
    detector = RefuelDetector(db)

    await db.update_state(VIN, {"fuel_level_pct": 20.0})
    await detector.handle(VIN, {"tanklevelpercent": 85.0, "odo": 41200}, NOW)

    refuels = await db.list_refuels(VIN, None, 10, 0)
    assert len(refuels) == 1
    assert refuels[0]["status"] == "pending"
    assert float(refuels[0]["fuel_level_before_pct"]) == 20.0
    assert float(refuels[0]["fuel_level_after_pct"]) == 85.0


@pytest.mark.asyncio
async def test_small_jump_is_ignored(db):
    """Le oscillazioni del sensore non devono generare rifornimenti fantasma."""
    detector = RefuelDetector(db)

    await db.update_state(VIN, {"fuel_level_pct": 50.0})
    await detector.handle(VIN, {"tanklevelpercent": 54.0, "odo": 41200}, NOW)

    assert await db.list_refuels(VIN, None, 10, 0) == []


@pytest.mark.asyncio
async def test_estimate_uses_tank_capacity(db):
    await db.pool.execute("UPDATE vehicle SET tank_capacity_l = 43 WHERE vin = $1", VIN)
    detector = RefuelDetector(db)

    await db.update_state(VIN, {"fuel_level_pct": 10.0})
    await detector.handle(VIN, {"tanklevelpercent": 60.0, "odo": 41200}, NOW)

    refuel = (await db.list_refuels(VIN, None, 10, 0))[0]
    # 50 punti percentuali di un serbatoio da 43 litri = 21,5 litri.
    assert float(refuel["liters_estimated"]) == pytest.approx(21.5, abs=0.1)


@pytest.mark.asyncio
async def test_confirm_sets_real_values_and_price(db):
    detector = RefuelDetector(db)
    await db.update_state(VIN, {"fuel_level_pct": 15.0})
    await detector.handle(VIN, {"tanklevelpercent": 90.0}, NOW)

    refuel_id = (await db.list_refuels(VIN, "pending", 10, 0))[0]["id"]
    await db.confirm_refuel(refuel_id, liters=38.5, cost_eur=69.30, full_tank=True, notes=None)

    confirmed = (await db.list_refuels(VIN, "confirmed", 10, 0))[0]
    assert float(confirmed["liters"]) == 38.5
    assert float(confirmed["price_per_liter"]) == pytest.approx(1.8, abs=0.01)
