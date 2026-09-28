"""Aggancio dei percorsi alle strade (map matching).

L'auto manda la posizione di rado, circa una volta al minuto e mezzo:
collegati con linee dritte i punti tagliano case e campi. OSRM (servizio
"match") trova la sequenza di strade piu' probabile che passa vicino a quei
punti nell'ordine e nei tempi giusti, e restituisce il percorso lungo le
strade.

Il risultato si tiene solo se la sua lunghezza torna con i km del viaggio
(contachilometri): con punti cosi' radi OSRM a volte prende una strada
parallela o fa un giro, e allora e' meglio la linea originale.

Per ricalcolare i viaggi gia' registrati:

    python -m app.mapmatch            # solo quelli ancora da agganciare
    python -m app.mapmatch --all      # tutti
"""

from __future__ import annotations

import asyncio
import logging
import sys
from datetime import datetime
from typing import Any
from uuid import UUID

import aiohttp

from .config import settings
from .db import Database

LOGGER = logging.getLogger(__name__)

# Tolleranza intorno a ogni punto (m). Il server pubblico di OSRM rifiuta
# raggi oltre ~50 m; 40 basta per l'errore del GPS di bordo.
_RADIUS_M = 40
# Il server pubblico accetta al massimo 10 punti per richiesta ("Too many
# trace coordinates", vedi settings.osrm_max_points): i viaggi piu' lunghi si
# agganciano a tratti, ognuno che riparte dall'ultimo punto del precedente.
# Lunghezza accettata rispetto ai km del viaggio: -25% / +30% (+0,5 km per
# i tragitti brevi, dove mezzo isolato pesa molto).
_MIN_RATIO = 0.75
_MAX_RATIO = 1.30
_SLACK_KM = 0.5


Point = tuple[datetime, float, float]  # (istante, lat, lon)


def build_match_url(base_url: str, points: list[Point]) -> str:
    """URL della richiesta OSRM "match" per i punti dati (gia' in ordine)."""
    coords = ";".join(f"{lon:.6f},{lat:.6f}" for _, lat, lon in points)
    radiuses = ";".join([str(_RADIUS_M)] * len(points))
    # I tempi devono crescere: due punti nello stesso secondo li rende uguali
    # e OSRM rifiuta la richiesta.
    stamps: list[int] = []
    for ts, _, _ in points:
        t = int(ts.timestamp())
        stamps.append(max(t, stamps[-1] + 1) if stamps else t)
    return (
        f"{base_url.rstrip('/')}/match/v1/driving/{coords}"
        f"?geometries=geojson&overview=full&gaps=ignore&tidy=true"
        f"&radiuses={radiuses}&timestamps={';'.join(map(str, stamps))}"
    )


def chunks(points: list[Point], size: int | None = None) -> list[list[Point]]:
    """Tratti di al massimo `size` punti; ognuno riparte dall'ultimo del precedente."""
    size = max(2, size or settings.osrm_max_points)
    if len(points) <= size:
        return [points]
    out, i = [], 0
    while i < len(points) - 1:
        out.append(points[i : i + size])
        i += size - 1
    return out


def parse_matching(data: dict[str, Any]) -> tuple[list[tuple[float, float]], float] | None:
    """Percorso agganciato come coppie (lon, lat) e la sua lunghezza in km."""
    if data.get("code") != "Ok" or not data.get("matchings"):
        return None
    coords: list[tuple[float, float]] = []
    distance_m = 0.0
    for m in data["matchings"]:
        distance_m += float(m.get("distance", 0))
        for lon, lat in m["geometry"]["coordinates"]:
            if not coords or coords[-1] != (lon, lat):
                coords.append((lon, lat))
    return (coords, distance_m / 1000) if len(coords) >= 2 else None


def plausible(km: float, expected_km: float | None) -> bool:
    """La lunghezza agganciata torna con i km del viaggio secondo l'auto?"""
    if not expected_km:
        return True
    return expected_km * _MIN_RATIO <= km <= expected_km * _MAX_RATIO + _SLACK_KM


async def match_route(
    session: aiohttp.ClientSession, points: list[Point], expected_km: float | None
) -> list[tuple[float, float]] | None:
    if len(points) < 2:
        return None
    coords: list[tuple[float, float]] = []
    km = 0.0
    for n, part in enumerate(chunks(points)):
        if n:
            # Il server pubblico chiede al massimo una richiesta al secondo.
            await asyncio.sleep(1.1)
        try:
            url = build_match_url(settings.osrm_url, part)
            async with session.get(url, timeout=aiohttp.ClientTimeout(total=20)) as resp:
                data = await resp.json(content_type=None)
        except (aiohttp.ClientError, asyncio.TimeoutError, ValueError) as exc:
            LOGGER.warning("Aggancio alle strade non riuscito: %s", exc)
            return None
        parsed = parse_matching(data)
        if parsed is None:
            LOGGER.info("Aggancio non riuscito su un tratto: %s", data.get("code"))
            return None
        part_coords, part_km = parsed
        coords.extend(c for c in part_coords if not coords or c != coords[-1])
        km += part_km
    if not plausible(km, expected_km):
        LOGGER.info("Aggancio scartato: %.2f km contro %.2f attesi", km, expected_km)
        return None
    return coords


class RouteMatcher:
    """Aggancia alle strade il percorso di un viaggio appena chiuso."""

    def __init__(self, db: Database) -> None:
        self._db = db
        self._session: aiohttp.ClientSession | None = None

    async def match_trip(self, trip_id: UUID) -> bool:
        if not settings.map_matching:
            return False
        points = await self._db.trip_points(trip_id)
        expected = await self._db.trip_expected_km(trip_id)
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession(headers={"User-Agent": "mb-companion/1.0"})
        coords = await match_route(self._session, points, expected)
        if coords is None:
            return False
        await self._db.set_route_matched(trip_id, coords)
        return True

    async def close(self) -> None:
        if self._session and not self._session.closed:
            await self._session.close()


async def _backfill(redo_all: bool) -> None:
    db = Database(settings.asyncpg_dsn)
    await db.connect()
    matcher = RouteMatcher(db)
    try:
        ids = await db.trips_to_match(redo_all)
        done = 0
        for trip_id in ids:
            if await matcher.match_trip(trip_id):
                done += 1
            # Il server pubblico chiede al massimo una richiesta al secondo.
            await asyncio.sleep(1.1)
        print(f"Agganciati {done} viaggi su {len(ids)}")
    finally:
        await matcher.close()
        await db.close()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(_backfill("--all" in sys.argv[1:]))
