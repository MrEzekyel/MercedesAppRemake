"""Accesso al database."""

from __future__ import annotations

import json
from datetime import datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

import asyncpg


class Database:
    def __init__(self, dsn: str) -> None:
        self._dsn = dsn
        self._pool: asyncpg.Pool | None = None

    async def connect(self) -> None:
        self._pool = await asyncpg.create_pool(self._dsn, min_size=1, max_size=5)

    async def close(self) -> None:
        if self._pool:
            await self._pool.close()

    @property
    def pool(self) -> asyncpg.Pool:
        if self._pool is None:
            raise RuntimeError("Database non connesso")
        return self._pool

    # -- veicoli -----------------------------------------------------------

    async def ensure_vehicle(self, vin: str) -> None:
        await self.pool.execute(
            """
            INSERT INTO vehicle (vin, display_name) VALUES ($1, $1)
            ON CONFLICT (vin) DO NOTHING
            """,
            vin,
        )

    async def update_state(self, vin: str, fields: dict[str, Any]) -> None:
        """Aggiorna solo gli attributi presenti nell'evento.

        Gli eventi sono parziali: sovrascrivere l'intera riga azzererebbe i
        valori non inclusi in questo messaggio.
        """
        if not fields:
            return

        columns = list(fields)
        values = [fields[c] for c in columns]
        placeholders = ", ".join(f"${i + 2}" for i in range(len(columns)))
        assignments = ", ".join(f"{c} = EXCLUDED.{c}" for c in columns)

        await self.pool.execute(
            f"""
            INSERT INTO vehicle_state (vin, {", ".join(columns)})
            VALUES ($1, {placeholders})
            ON CONFLICT (vin) DO UPDATE SET {assignments}, updated_at = now()
            """,
            vin,
            *values,
        )

    async def update_position(self, vin: str, lat: float, lon: float, ts: datetime) -> None:
        await self.pool.execute(
            """
            INSERT INTO vehicle_state (vin, position, position_updated_at)
            VALUES ($1, ST_SetSRID(ST_MakePoint($3, $2), 4326)::geography, $4)
            ON CONFLICT (vin) DO UPDATE
               SET position = EXCLUDED.position,
                   position_updated_at = EXCLUDED.position_updated_at,
                   updated_at = now()
            """,
            vin,
            lat,
            lon,
            ts,
        )

    async def get_tank_capacity(self, vin: str) -> float | None:
        value = await self.pool.fetchval(
            "SELECT tank_capacity_l FROM vehicle WHERE vin = $1", vin
        )
        return float(value) if value is not None else None

    async def get_fuel_level(self, vin: str) -> float | None:
        """Ultimo livello carburante conosciuto, letto PRIMA di aggiornarlo.

        Serve al rilevamento rifornimenti: il salto va misurato contro il
        valore precedente, non contro se stesso dopo l'update.
        """
        value = await self.pool.fetchval(
            "SELECT fuel_level_pct FROM vehicle_state WHERE vin = $1", vin
        )
        return float(value) if value is not None else None

    async def get_state(self, vin: str | None = None) -> list[dict[str, Any]]:
        rows = await self.pool.fetch(
            """
            SELECT v.vin, v.display_name, v.tank_capacity_l, s.updated_at,
                   ST_Y(s.position::geometry) AS latitude,
                   ST_X(s.position::geometry) AS longitude,
                   s.heading, s.position_updated_at, s.odometer_km,
                   s.fuel_level_pct, s.range_km, s.ignition_state,
                   s.engine_running, s.doors_locked, s.openings,
                   s.tire_pressures, s.warnings
            FROM vehicle v LEFT JOIN vehicle_state s USING (vin)
            WHERE $1::text IS NULL OR v.vin = $1
            """,
            vin,
        )
        return [_row_to_dict(r) for r in rows]

    # -- eventi grezzi -----------------------------------------------------

    async def log_raw_event(self, vin: str, event_type: str, payload: dict[str, Any]) -> None:
        await self.pool.execute(
            "INSERT INTO raw_event (vin, event_type, payload) VALUES ($1, $2, $3)",
            vin,
            event_type,
            json.dumps(payload, default=str),
        )

    # -- viaggi ------------------------------------------------------------

    async def open_trip(self, vin: str, started_at: datetime, odometer: int | None) -> UUID | None:
        """Apre un viaggio. Restituisce None se ce n'e' gia' uno aperto."""
        return await self.pool.fetchval(
            """
            INSERT INTO trip (vin, started_at, odometer_start)
            VALUES ($1, $2, $3)
            ON CONFLICT DO NOTHING
            RETURNING id
            """,
            vin,
            started_at,
            odometer,
        )

    async def get_open_trip(self, vin: str) -> dict[str, Any] | None:
        row = await self.pool.fetchrow(
            "SELECT id, started_at, odometer_start FROM trip WHERE vin = $1 AND ended_at IS NULL",
            vin,
        )
        return _row_to_dict(row) if row else None

    async def add_trip_point(
        self, trip_id: UUID, ts: datetime, lat: float, lon: float,
        heading: float | None, odometer: int | None,
    ) -> None:
        await self.pool.execute(
            """
            INSERT INTO trip_point (trip_id, recorded_at, position, heading, odometer_km)
            VALUES ($1, $2, ST_SetSRID(ST_MakePoint($4, $3), 4326)::geography, $5, $6)
            ON CONFLICT (trip_id, recorded_at) DO NOTHING
            """,
            trip_id, ts, lat, lon, heading, odometer,
        )

    async def last_trip_point(self, trip_id: UUID) -> tuple[datetime, float, float] | None:
        row = await self.pool.fetchrow(
            """
            SELECT recorded_at,
                   ST_Y(position::geometry) AS lat,
                   ST_X(position::geometry) AS lon
            FROM trip_point WHERE trip_id = $1
            ORDER BY recorded_at DESC LIMIT 1
            """,
            trip_id,
        )
        return (row["recorded_at"], row["lat"], row["lon"]) if row else None

    async def close_trip(
        self, trip_id: UUID, ended_at: datetime, odometer: int | None,
        distance_km: float | None, fuel_used_l: float | None, avg_speed_kmh: float | None,
    ) -> None:
        """Chiude il viaggio e materializza la traccia dai punti raccolti.

        start/end_position e distance_gps_km sono derivati qui dai punti,
        cosi' restano coerenti con la traccia anche se l'auto non ha
        riportato i contatori di bordo.
        """
        await self.pool.execute(
            """
            WITH pts AS (
                SELECT position, recorded_at FROM trip_point
                WHERE trip_id = $1 ORDER BY recorded_at
            ), line AS (
                SELECT CASE WHEN count(*) >= 2
                            THEN ST_MakeLine(position::geometry ORDER BY recorded_at)::geography
                       END AS route,
                       (array_agg(position ORDER BY recorded_at))[1] AS first_pos,
                       (array_agg(position ORDER BY recorded_at DESC))[1] AS last_pos
                FROM pts
            )
            UPDATE trip SET
                ended_at        = $2,
                odometer_end    = $3,
                distance_km     = $4,
                fuel_used_l     = $5,
                avg_speed_kmh   = $6,
                route           = line.route,
                start_position  = COALESCE(trip.start_position, line.first_pos),
                end_position    = line.last_pos,
                distance_gps_km = ROUND((ST_Length(line.route) / 1000)::numeric, 2)
            FROM line
            WHERE trip.id = $1
            """,
            trip_id, ended_at, odometer, distance_km, fuel_used_l, avg_speed_kmh,
        )

    async def list_trips(self, vin: str | None, limit: int, offset: int) -> list[dict[str, Any]]:
        rows = await self.pool.fetch(
            """
            SELECT id, vin, started_at, ended_at, duration_s,
                   distance_effective_km, l_per_100km, km_per_l,
                   fuel_used_l, avg_speed_kmh, odometer_start, odometer_end,
                   ST_Y(start_position::geometry) AS start_lat,
                   ST_X(start_position::geometry) AS start_lon,
                   ST_Y(end_position::geometry)   AS end_lat,
                   ST_X(end_position::geometry)   AS end_lon
            FROM trip_stats
            WHERE ($1::text IS NULL OR vin = $1)
            ORDER BY started_at DESC
            LIMIT $2 OFFSET $3
            """,
            vin, limit, offset,
        )
        return [_row_to_dict(r) for r in rows]

    async def get_trip(self, trip_id: UUID) -> dict[str, Any] | None:
        row = await self.pool.fetchrow(
            """
            SELECT id, vin, started_at, ended_at, duration_s,
                   distance_effective_km, distance_km, distance_gps_km,
                   l_per_100km, km_per_l, fuel_used_l, avg_speed_kmh,
                   odometer_start, odometer_end,
                   ST_AsGeoJSON(route::geometry) AS route_geojson
            FROM trip_stats WHERE id = $1
            """,
            trip_id,
        )
        if row is None:
            return None
        trip = _row_to_dict(row)
        raw = trip.pop("route_geojson", None)
        trip["route"] = json.loads(raw)["coordinates"] if raw else []
        return trip


    # -- rifornimenti -------------------------------------------------------

    async def create_pending_refuel(
        self, vin: str, ts: datetime, odometer: int | None,
        before_pct: float, after_pct: float, liters_estimated: float | None,
    ) -> UUID:
        return await self.pool.fetchval(
            """
            INSERT INTO refuel (
                vin, detected_at, odometer_km,
                fuel_level_before_pct, fuel_level_after_pct, liters_estimated
            ) VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id
            """,
            vin, ts, odometer, before_pct, after_pct, liters_estimated,
        )

    async def list_refuels(
        self, vin: str | None, status: str | None, limit: int, offset: int
    ) -> list[dict[str, Any]]:
        rows = await self.pool.fetch(
            """
            SELECT id, vin, status, detected_at, odometer_km,
                   fuel_level_before_pct, fuel_level_after_pct,
                   liters_estimated, liters, cost_eur, price_per_liter,
                   full_tank, notes, confirmed_at
            FROM refuel_stats
            WHERE ($1::text IS NULL OR vin = $1)
              AND ($2::text IS NULL OR status = $2)
            ORDER BY detected_at DESC
            LIMIT $3 OFFSET $4
            """,
            vin, status, limit, offset,
        )
        return [_row_to_dict(r) for r in rows]

    async def confirm_refuel(
        self, refuel_id: UUID, liters: float, cost_eur: float | None,
        full_tank: bool, notes: str | None,
    ) -> dict[str, Any] | None:
        row = await self.pool.fetchrow(
            """
            UPDATE refuel SET
                status = 'confirmed', liters = $2, cost_eur = $3,
                full_tank = $4, notes = $5, confirmed_at = now()
            WHERE id = $1
            RETURNING id
            """,
            refuel_id, liters, cost_eur, full_tank, notes,
        )
        return _row_to_dict(row) if row else None

    async def delete_refuel(self, refuel_id: UUID) -> bool:
        """Scarta un rifornimento rilevato per errore (es. sensore rumoroso)."""
        result = await self.pool.execute("DELETE FROM refuel WHERE id = $1", refuel_id)
        return result != "DELETE 0"

    # -- comandi remoti ------------------------------------------------------

    async def log_command(
        self, command_id: UUID, vin: str, command: str, params: dict[str, Any]
    ) -> None:
        """Registra un comando appena inviato. L'id e' anche il request_id
        mandato a Mercedes, cosi' la risposta asincrona (apptwin_command_
        status_updates_by_vin) si puo' ricollegare a questa riga.
        """
        await self.pool.execute(
            "INSERT INTO command_log (id, vin, command, params) VALUES ($1, $2, $3, $4)",
            command_id, vin, command, json.dumps(params),
        )

    async def complete_command(self, command_id: UUID, status: str, error: str | None) -> None:
        await self.pool.execute(
            """
            UPDATE command_log SET status = $2, error = $3, completed_at = now()
            WHERE id = $1 AND status = 'pending'
            """,
            command_id, status, error,
        )

    async def get_command(self, command_id: UUID) -> dict[str, Any] | None:
        row = await self.pool.fetchrow("SELECT * FROM command_log WHERE id = $1", command_id)
        return _row_to_dict(row) if row else None


def _row_to_dict(row: asyncpg.Record) -> dict[str, Any]:
    out = dict(row)
    for key, value in out.items():
        # asyncpg restituisce le colonne numeric come Decimal; FastAPI le
        # serializza come stringa (per non perdere precisione), ma l'app
        # mobile si aspetta un number su cui chiamare .toFixed().
        if isinstance(value, Decimal):
            out[key] = float(value)
        # asyncpg restituisce jsonb come stringa se non e' registrato un codec.
        elif isinstance(value, str) and key in {"openings", "tire_pressures", "warnings", "params"}:
            out[key] = json.loads(value)
    return out
