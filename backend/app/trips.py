"""Rilevamento dei viaggi dallo stream di eventi dell'auto.

L'API Mercedes non espone uno storico viaggi: offre solo i contatori di bordo,
che sono valori istantanei. Il viaggio va quindi dedotto osservando lo stato di
accensione, e il percorso ricostruito campionando la posizione durante la marcia.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
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


# Contatori del computer di bordo "da partenza". L'auto li azzera solo dopo
# circa 4 ore di sosta, non a ogni accensione: due viaggi ravvicinati li
# accumulano. Ogni messaggio porta solo i campi cambiati, quindi vanno
# ricordati fra un messaggio e l'altro.
_COUNTERS = ("distanceStart", "liquidconsumptionstart", "drivenTimeStart", "odo")

# Livello del serbatoio e autonomia: ultimo valore noto, per il "prima e
# dopo" del viaggio.
_LEVELS = ("tanklevelpercent", "rangeliquid")

# Dopo lo spegnimento l'auto puo' mandare consumo e tempo di guida in un
# messaggio successivo: per questo tempo il viaggio appena chiuso si aggiorna.
_LATE_DATA_WINDOW_S = 600

# Oltre questa differenza dal contachilometri una distanza e' implausibile.
_ODOMETER_TOLERANCE_KM = 1.5


@dataclass
class _Closed:
    trip_id: UUID
    ended_at: datetime
    duration_s: float
    baseline: dict[str, float]


class TripRecorder:
    def __init__(self, db: Database) -> None:
        self._db = db
        # Ultimo valore noto di ogni contatore, per veicolo.
        self._counters: dict[str, dict[str, float]] = {}
        self._levels: dict[str, dict[str, float]] = {}
        # Contatori all'apertura di ciascun viaggio ancora aperto.
        self._baselines: dict[UUID, dict[str, float]] = {}
        self._recent_closed: dict[str, _Closed] = {}

    async def handle(self, vin: str, attrs: dict[str, Any], ts: datetime) -> None:
        counters = self._counters.setdefault(vin, {})
        for key in _COUNTERS:
            value = _as_float(attrs.get(key))
            if value is not None:
                counters[key] = value
        levels = self._levels.setdefault(vin, {})
        for key in _LEVELS:
            value = _as_float(attrs.get(key))
            if value is not None:
                levels[key] = value

        ignition = is_ignition_on(attrs)
        if ignition is True:
            await self._ensure_open(vin, ts)
        elif ignition is False:
            await self._close_if_open(vin, ts)
        else:
            await self._update_recently_closed(vin, ts)

        await self._maybe_record_point(vin, attrs, ts, _as_int(counters.get("odo")))

    async def _ensure_open(self, vin: str, ts: datetime) -> None:
        counters = self._counters[vin]
        fuel, range_km = self._level(vin)
        trip_id = await self._db.open_trip(vin, ts, _as_int(counters.get("odo")), fuel, range_km)
        if trip_id:
            self._baselines[trip_id] = dict(counters)
            self._recent_closed.pop(vin, None)
            LOGGER.info("Viaggio aperto per %s", _mask(vin))

    async def _close_if_open(self, vin: str, ts: datetime) -> None:
        trip = await self._db.get_open_trip(vin)
        if trip is None:
            return

        # Dopo un riavvio del backend a viaggio in corso i contatori di
        # partenza sono persi: resta il contachilometri salvato sul viaggio.
        baseline = self._baselines.pop(trip["id"], None)
        if baseline is None:
            baseline = {} if trip["odometer_start"] is None else {"odo": float(trip["odometer_start"])}

        duration_s = (ts - trip["started_at"]).total_seconds()
        counters = self._counters[vin]
        distance, fuel_used, avg_speed = trip_metrics(baseline, counters, duration_s)
        fuel, range_km = self._level(vin)
        await self._db.close_trip(
            trip["id"], ts, _as_int(counters.get("odo")), distance, fuel_used, avg_speed,
            fuel, range_km,
        )
        self._recent_closed[vin] = _Closed(trip["id"], ts, duration_s, baseline)
        LOGGER.info("Viaggio chiuso per %s (%s km)", _mask(vin), distance)

    async def _update_recently_closed(self, vin: str, ts: datetime) -> None:
        closed = self._recent_closed.get(vin)
        if closed is None:
            return
        if (ts - closed.ended_at).total_seconds() > _LATE_DATA_WINDOW_S:
            del self._recent_closed[vin]
            return
        counters = self._counters[vin]
        distance, fuel_used, avg_speed = trip_metrics(closed.baseline, counters, closed.duration_s)
        fuel, range_km = self._level(vin)
        await self._db.update_trip_metrics(
            closed.trip_id, _as_int(counters.get("odo")), distance, fuel_used, avg_speed,
            fuel, range_km,
        )

    def _level(self, vin: str) -> tuple[float | None, int | None]:
        levels = self._levels.get(vin, {})
        return levels.get("tanklevelpercent"), _as_int(levels.get("rangeliquid"))

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


def trip_metrics(
    start: dict[str, float], end: dict[str, float], duration_s: float
) -> tuple[float | None, float | None, float | None]:
    """Distanza (km), carburante (l) e velocita' media (km/h) di un viaggio
    dai contatori "da partenza" all'inizio e alla fine.

    Se i contatori non sono stati azzerati fra un viaggio e l'altro, il
    viaggio e' la differenza fra fine e inizio; se sono stati azzerati, e'
    il valore finale. Quale dei due lo dice il contachilometri (a km interi).
    """
    dist_end = end.get("distanceStart")
    if dist_end is None:
        return None, None, None
    odo_delta = end["odo"] - start["odo"] if "odo" in start and "odo" in end else None

    dist_start = start.get("distanceStart")
    same_session = dist_start is not None and dist_end >= dist_start
    if same_session and odo_delta is not None:
        same_session = abs(dist_end - dist_start - odo_delta) <= abs(dist_end - odo_delta)

    distance = dist_end - dist_start if same_session else dist_end
    if odo_delta is not None and abs(distance - odo_delta) > _ODOMETER_TOLERANCE_KM:
        # Contatori non affidabili (es. partenza persa): meglio i km interi
        # del contachilometri che una distanza sbagliata di molto.
        return float(odo_delta), None, odo_delta / duration_s * 3600 if duration_s > 0 else None

    def total_fuel(counters: dict[str, float]) -> float | None:
        dist, consumption = counters.get("distanceStart"), counters.get("liquidconsumptionstart")
        if dist == 0:
            return 0.0
        # liquidconsumptionstart e' la media in L/100km da partenza.
        return dist * consumption / 100 if dist is not None and consumption is not None else None

    fuel_end = total_fuel(end)
    fuel_start = total_fuel(start) if same_session else 0.0
    fuel_used = fuel_end - fuel_start if fuel_end is not None and fuel_start is not None else None

    minutes_end = end.get("drivenTimeStart")
    # A contatori appena azzerati (0 km) anche il tempo di guida parte da 0,
    # anche se l'auto non l'ha ancora riportato.
    fresh = not same_session or dist_start == 0
    minutes_start = 0.0 if fresh else start.get("drivenTimeStart")
    minutes = (
        minutes_end - minutes_start if minutes_end is not None and minutes_start is not None else None
    )
    hours = minutes / 60 if minutes and minutes > 0 else duration_s / 3600
    avg_speed = distance / hours if hours > 0 else None

    return round(distance, 2), _round(fuel_used, 2), _round(avg_speed, 1)


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


def _round(value: float | None, digits: int) -> float | None:
    return round(value, digits) if value is not None else None


def _mask(vin: str) -> str:
    return f"...{vin[-4:]}" if len(vin) > 4 else "***"
