"""Rilevamento dei viaggi dallo stream di eventi dell'auto.

L'API Mercedes non espone uno storico viaggi: offre solo i contatori di bordo,
che sono valori istantanei. Il viaggio va quindi dedotto osservando lo stato di
accensione, e il percorso ricostruito campionando la posizione durante la marcia.
"""

from __future__ import annotations

import logging
from datetime import datetime
from math import asin, cos, radians, sin, sqrt
from typing import Any
from uuid import UUID

from .config import settings
from .db import Database
from .events import is_ignition_on, position

LOGGER = logging.getLogger(__name__)


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Distanza in metri fra due coordinate."""
    r = 6371000.0
    dlat, dlon = radians(lat2 - lat1), radians(lon2 - lon1)
    a = sin(dlat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon / 2) ** 2
    return 2 * r * asin(sqrt(a))


class TripRecorder:
    def __init__(self, db: Database) -> None:
        self._db = db

    async def handle(self, vin: str, attrs: dict[str, Any], ts: datetime) -> None:
        ignition = is_ignition_on(attrs)
        odometer = _as_int(attrs.get("odo"))

        if ignition is True:
            await self._ensure_open(vin, ts, odometer)
        elif ignition is False:
            await self._close_if_open(vin, attrs, ts, odometer)

        await self._maybe_record_point(vin, attrs, ts, odometer)

    async def _ensure_open(self, vin: str, ts: datetime, odometer: int | None) -> None:
        trip_id = await self._db.open_trip(vin, ts, odometer)
        if trip_id:
            LOGGER.info("Viaggio aperto per %s", _mask(vin))

    async def _close_if_open(
        self, vin: str, attrs: dict[str, Any], ts: datetime, odometer: int | None
    ) -> None:
        trip = await self._db.get_open_trip(vin)
        if trip is None:
            return

        distance = _as_float(attrs.get("distanceStart"))
        avg_speed = _as_float(attrs.get("averageSpeedStart"))

        # liquidconsumptionstart e' un consumo medio in L/100km, non i litri
        # spesi: vanno ricavati dalla distanza.
        consumption = _as_float(attrs.get("liquidconsumptionstart"))
        fuel_used = (
            distance * consumption / 100
            if distance is not None and consumption is not None
            else None
        )

        await self._db.close_trip(
            trip["id"], ts, odometer, distance, fuel_used, avg_speed
        )
        LOGGER.info("Viaggio chiuso per %s (%s km)", _mask(vin), distance)

    async def _maybe_record_point(
        self, vin: str, attrs: dict[str, Any], ts: datetime, odometer: int | None
    ) -> None:
        coords = position(attrs)
        if coords is None:
            return

        trip = await self._db.get_open_trip(vin)
        if trip is None:
            return

        lat, lon = coords
        last = await self._db.last_trip_point(trip["id"])
        if last is not None and not _worth_recording(last, ts, lat, lon):
            return

        await self._db.add_trip_point(
            trip["id"], ts, lat, lon, _as_float(attrs.get("positionHeading")), odometer
        )


def _worth_recording(
    last: tuple[datetime, float, float], ts: datetime, lat: float, lon: float
) -> bool:
    """Scarta i punti troppo ravvicinati nel tempo o nello spazio.

    L'auto manda aggiornamenti molto piu' fitti di quanto serva a disegnare un
    percorso, e da ferma continuerebbe ad accumulare punti nello stesso posto.
    """
    last_ts, last_lat, last_lon = last
    if (ts - last_ts).total_seconds() < settings.trip_point_min_seconds:
        return False
    return haversine_m(last_lat, last_lon, lat, lon) >= settings.trip_point_min_meters


def _as_int(value: Any) -> int | None:
    try:
        return int(value) if value is not None else None
    except (TypeError, ValueError):
        return None


def _as_float(value: Any) -> float | None:
    try:
        return float(value) if value is not None else None
    except (TypeError, ValueError):
        return None


def _mask(vin: str) -> str:
    return f"...{vin[-4:]}" if len(vin) > 4 else "***"
