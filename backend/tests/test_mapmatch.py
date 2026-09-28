"""Aggancio dei percorsi alle strade: richiesta a OSRM, controllo dei km e
uso del percorso agganciato al posto della linea fra i punti.
"""

from __future__ import annotations

import asyncio
import os
from datetime import timedelta

import pytest
import pytest_asyncio

from app.db import Database
from app.mapmatch import build_match_url, chunks, parse_matching, plausible
from app.trips import TripRecorder
from tests.test_trip_recording import ROUTE, START, VIN

DSN = os.environ.get("TEST_DATABASE_URL")


def _points(n: int, same_second: bool = False):
    return [
        (START + timedelta(seconds=0 if same_second else 90 * i), 41.76 + i * 0.001, 12.30 + i * 0.001)
        for i in range(n)
    ]


def test_url_has_lon_lat_radiuses_and_increasing_timestamps():
    url = build_match_url("https://osrm.example/", _points(3, same_second=True))
    assert url.startswith("https://osrm.example/match/v1/driving/12.300000,41.760000;12.301000,41.761000;")
    assert "radiuses=40;40;40" in url
    stamps = [int(s) for s in url.split("timestamps=")[1].split(";")]
    assert stamps == sorted(set(stamps)) and len(stamps) == 3


def test_long_trips_are_split_into_overlapping_chunks():
    pts = _points(23)
    parts = chunks(pts, 10)
    assert [len(p) for p in parts] == [10, 10, 5]
    # Ogni tratto riparte dall'ultimo punto del precedente: nessun buco.
    assert parts[0][-1] == parts[1][0] and parts[1][-1] == parts[2][0]
    assert parts[-1][-1] == pts[-1]
    assert chunks(pts[:4], 10) == [pts[:4]]


def _response(km: float, *matchings):
    return {
        "code": "Ok",
        "matchings": [
            {"distance": km * 1000 / len(matchings), "geometry": {"coordinates": coords}} for coords in matchings
        ],
    }


def test_matching_is_kept_when_length_agrees_with_the_car():
    data = _response(7.84, [[12.30, 41.76], [12.31, 41.77]], [[12.31, 41.77], [12.37, 41.76]])
    coords, km = parse_matching(data)
    # I tratti si uniscono senza ripetere il punto di giunzione.
    assert coords == [(12.30, 41.76), (12.31, 41.77), (12.37, 41.76)]
    assert plausible(km, 8.0)


def test_matching_is_dropped_when_it_takes_a_detour():
    _, km = parse_matching(_response(17.9, [[12.30, 41.76], [12.37, 41.76]]))
    assert not plausible(km, 8.0)
    assert parse_matching({"code": "NoMatch"}) is None


@pytest.mark.skipif(not DSN, reason="TEST_DATABASE_URL non impostata")
@pytest.mark.asyncio
async def test_closed_trip_is_matched_and_served_instead_of_the_raw_line():
    db = Database(DSN)
    await db.connect()
    await db.pool.execute("DELETE FROM vehicle WHERE vin = $1", VIN)
    await db.ensure_vehicle(VIN)
    try:
        matched = [(12.0, 45.0), (12.5, 45.5), (13.0, 46.0)]

        async def fake_match(trip_id):
            assert len(await db.trip_points(trip_id)) == len(ROUTE)
            assert await db.trip_expected_km(trip_id) == 3.0
            await db.set_route_matched(trip_id, matched)

        recorder = TripRecorder(db, on_closed=fake_match)
        await recorder.handle(VIN, {"ignitionstate": "4", "odo": 41000}, START)
        for i, (lat, lon) in enumerate(ROUTE):
            await recorder.handle(VIN, {"ignitionstate": "4", "positionLat": lat, "positionLong": lon}, START + timedelta(minutes=i + 1))
        await recorder.handle(VIN, {"ignitionstate": "0", "odo": 41003, "distanceStart": 3.0}, START + timedelta(minutes=10))
        await asyncio.gather(*recorder._background)

        trip_id = (await db.list_trips(VIN, 1, 0))[0]["id"]
        detail = await db.get_trip(trip_id)
        assert detail["route_is_matched"] is True
        assert [tuple(c) for c in detail["route"]] == matched
        assert await db.trips_to_match(False) == [] or trip_id not in await db.trips_to_match(False)
    finally:
        await db.pool.execute("DELETE FROM vehicle WHERE vin = $1", VIN)
        await db.close()
