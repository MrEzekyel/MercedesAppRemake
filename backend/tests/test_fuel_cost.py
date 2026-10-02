"""Test del costo viaggi FIFO. Funzione pura: nessun database richiesto."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from app.fuel_cost import RefuelLot, TripFuel, fifo_costs

T0 = datetime(2026, 9, 1, 8, 0, tzinfo=timezone.utc)


def at(hours: float) -> datetime:
    return T0 + timedelta(hours=hours)


def test_example_from_spec():
    """20 L a 2,00; viaggi per 15 L; 20 L a 2,10; viaggio da 10 L.

    Il viaggio da 10 L brucia i 5 L rimasti del primo pieno a 2,00 e 5 L del
    secondo a 2,10: 5 x 2,00 + 5 x 2,10 = 20,50.
    """
    refuels = [RefuelLot(at(0), 20, 2.00), RefuelLot(at(10), 20, 2.10)]
    trips = [
        TripFuel("a", at(2), 8),
        TripFuel("b", at(4), 7),
        TripFuel("c", at(12), 10),
    ]
    costs = fifo_costs(trips, refuels, tank_capacity_l=None)

    assert costs["a"].cost_eur == pytest.approx(16.00)
    assert costs["b"].cost_eur == pytest.approx(14.00)
    assert costs["c"].cost_eur == pytest.approx(5 * 2.00 + 5 * 2.10)
    assert all(c.uncovered_l == 0 for c in costs.values())


def test_three_refuels_before_first_is_used_up():
    """Tre rifornimenti uno sopra l'altro: si consumano in ordine d'arrivo."""
    refuels = [
        RefuelLot(at(0), 10, 2.00),
        RefuelLot(at(1), 10, 2.10),
        RefuelLot(at(2), 10, 2.20),
    ]
    trips = [TripFuel("long", at(5), 25)]
    costs = fifo_costs(trips, refuels, tank_capacity_l=None)

    assert costs["long"].cost_eur == pytest.approx(10 * 2.00 + 10 * 2.10 + 5 * 2.20)


def test_total_equals_weighted_average_once_tank_is_empty():
    """Consumato tutto, FIFO e media pesata sui litri danno lo stesso totale."""
    refuels = [RefuelLot(at(0), 20, 2.00), RefuelLot(at(3), 20, 2.10)]
    trips = [TripFuel("a", at(1), 12), TripFuel("b", at(4), 18), TripFuel("c", at(6), 10)]
    costs = fifo_costs(trips, refuels, tank_capacity_l=None)

    fifo_total = sum(c.cost_eur for c in costs.values())
    average = (20 * 2.00 + 20 * 2.10) / 40
    assert fifo_total == pytest.approx(40 * average)


def test_trip_ending_after_late_detected_refuel_uses_new_fuel():
    """Il rifornimento viene rilevato all'accensione del viaggio dopo.

    Il viaggio inizia prima del rilevamento ma finisce dopo: deve stare dopo
    il rifornimento, perche' nella realta' e' partito col serbatoio pieno.
    """
    refuels = [RefuelLot(at(0), 5, 2.00), RefuelLot(at(10), 30, 2.10)]
    trips = [TripFuel("after", at(10.5), 5)]
    costs = fifo_costs(trips, refuels, tank_capacity_l=None)

    # Prima brucia i 5 L vecchi: il rifornimento sta davanti a lui nella coda.
    assert costs["after"].cost_eur == pytest.approx(5 * 2.00)


def test_pending_refuel_liters_are_uncovered_not_invented():
    """Un rifornimento da confermare occupa il suo posto nella coda ma non ha prezzo."""
    refuels = [RefuelLot(at(0), 10, 2.00), RefuelLot(at(1), 20, None)]
    trips = [TripFuel("a", at(2), 15)]
    cost = fifo_costs(trips, refuels, tank_capacity_l=None)["a"]

    assert cost.cost_eur == pytest.approx(20.00)
    assert cost.uncovered_l == pytest.approx(5)


def test_trips_before_any_refuel_are_uncovered():
    cost = fifo_costs([TripFuel("a", at(1), 6)], [], tank_capacity_l=43)["a"]
    assert cost.cost_eur == 0
    assert cost.uncovered_l == pytest.approx(6)


def test_fuel_already_in_tank_at_first_refuel_is_burned_first():
    """Al primo rifornimento c'erano gia' 12,9 L (30% di 43): vanno prima dei 20 nuovi.

    Senza questo, tutta la coda partirebbe 12,9 L in anticipo e ogni viaggio
    successivo sarebbe prezzato col rifornimento sbagliato.
    """
    refuels = [RefuelLot(at(0), 20, 2.00, level_before_pct=30)]
    trips = [TripFuel("a", at(1), 15)]
    cost = fifo_costs(trips, refuels, tank_capacity_l=43)["a"]

    assert cost.uncovered_l == pytest.approx(12.9)
    assert cost.cost_eur == pytest.approx(2.1 * 2.00)


def test_full_tank_trims_liters_the_car_did_not_count():
    """Un pieno vero riallinea la coda alla capacita'.

    La coda dice che restano 10 L, ma il pieno ne ha richiesti 40 su un
    serbatoio da 43: nel serbatoio ce n'erano solo 3. I 7 L in piu' erano
    gia' stati bruciati e non pesano sui viaggi dopo.
    """
    refuels = [
        RefuelLot(at(0), 30, 2.00),
        RefuelLot(at(5), 40, 2.10, full_tank=True, level_after_pct=100),
    ]
    trips = [TripFuel("a", at(1), 20), TripFuel("b", at(6), 10)]
    costs = fifo_costs(trips, refuels, tank_capacity_l=43)

    assert costs["b"].cost_eur == pytest.approx(3 * 2.00 + 7 * 2.10)


def test_full_tank_flag_ignored_when_sensor_says_not_full():
    """I vecchi record con "pieno" attivo di default non devono riallineare nulla."""
    refuels = [
        RefuelLot(at(0), 30, 2.00),
        RefuelLot(at(5), 20, 2.10, full_tank=True, level_after_pct=60),
    ]
    trips = [TripFuel("a", at(1), 20), TripFuel("b", at(6), 10)]
    costs = fifo_costs(trips, refuels, tank_capacity_l=43)

    assert costs["b"].cost_eur == pytest.approx(10 * 2.00)
