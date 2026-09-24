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

    # Colonne jsonb che raccolgono piu' segnali (es. openings ha una chiave
    # per porta): un evento tipico ne aggiorna solo una parte, quindi vanno
    # fuse con quel che c'e' gia' invece di sovrascrivere il blob intero -
    # altrimenti ogni update cancellerebbe i valori delle altre chiavi.
    _MERGE_JSON_COLUMNS = {"openings", "tire_pressures", "warnings", "eco_score"}

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
        assignments = ", ".join(
            f"{c} = vehicle_state.{c} || EXCLUDED.{c}" if c in self._MERGE_JSON_COLUMNS
            else f"{c} = EXCLUDED.{c}"
            for c in columns
        )

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
            SELECT v.vin, v.display_name, v.tank_capacity_l,
                   v.fuel_price_eur_per_l, s.updated_at,
                   ST_Y(s.position::geometry) AS latitude,
                   ST_X(s.position::geometry) AS longitude,
                   s.heading, s.position_updated_at, s.odometer_km,
                   s.fuel_level_pct, s.range_km, s.ignition_state,
                   s.engine_running, s.doors_locked, s.park_brake_engaged,
                   s.openings, s.tire_pressures, s.warnings, s.eco_score,
                   s.service_interval_days
            FROM vehicle v LEFT JOIN vehicle_state s USING (vin)
            WHERE $1::text IS NULL OR v.vin = $1
            """,
            vin,
        )
        return [_row_to_dict(r) for r in rows]

    async def get_vehicle_position(self, vin: str) -> tuple[float, float] | None:
        row = await self.pool.fetchrow(
            "SELECT ST_Y(position::geometry) AS lat, ST_X(position::geometry) AS lon "
            "FROM vehicle_state WHERE vin = $1 AND position IS NOT NULL",
            vin,
        )
        return (float(row["lat"]), float(row["lon"])) if row else None

    async def set_fuel_price(self, vin: str, price: float | None) -> dict[str, Any] | None:
        """None rimette il prezzo "automatico" (media dei rifornimenti)."""
        row = await self.pool.fetchrow(
            """
            UPDATE vehicle SET fuel_price_eur_per_l = $2
            WHERE vin = $1
            RETURNING vin, fuel_price_eur_per_l
            """,
            vin,
            price,
        )
        return _row_to_dict(row) if row is not None else None

    # -- eventi grezzi -----------------------------------------------------

    async def log_raw_event(self, vin: str, event_type: str, payload: dict[str, Any]) -> None:
        await self.pool.execute(
            "INSERT INTO raw_event (vin, event_type, payload) VALUES ($1, $2, $3)",
            vin,
            event_type,
            json.dumps(payload, default=str),
        )

    # -- viaggi ------------------------------------------------------------

    async def open_trip(
        self, vin: str, started_at: datetime, odometer: int | None,
        fuel_level_pct: float | None = None, range_km: int | None = None,
    ) -> UUID | None:
        """Apre un viaggio. Restituisce None se ce n'e' gia' uno aperto."""
        return await self.pool.fetchval(
            """
            INSERT INTO trip (vin, started_at, odometer_start, fuel_level_start_pct, range_start_km)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT DO NOTHING
            RETURNING id
            """,
            vin,
            started_at,
            odometer,
            fuel_level_pct,
            range_km,
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
        fuel_level_pct: float | None = None, range_km: int | None = None,
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
                fuel_level_end_pct = $7,
                range_end_km    = $8,
                route           = line.route,
                start_position  = COALESCE(trip.start_position, line.first_pos),
                end_position    = line.last_pos,
                distance_gps_km = ROUND((ST_Length(line.route) / 1000)::numeric, 2)
            FROM line
            WHERE trip.id = $1
            """,
            trip_id, ended_at, odometer, distance_km, fuel_used_l, avg_speed_kmh,
            fuel_level_pct, range_km,
        )

    async def update_trip_metrics(
        self, trip_id: UUID, odometer_end: int | None, distance_km: float | None,
        fuel_used_l: float | None, avg_speed_kmh: float | None,
        fuel_level_pct: float | None = None, range_km: int | None = None,
    ) -> None:
        """Aggiorna i numeri di un viaggio gia' chiuso con dati arrivati dopo."""
        await self.pool.execute(
            """
            UPDATE trip SET
                odometer_end  = COALESCE($2, odometer_end),
                distance_km   = COALESCE($3, distance_km),
                fuel_used_l   = COALESCE($4, fuel_used_l),
                avg_speed_kmh = COALESCE($5, avg_speed_kmh),
                fuel_level_end_pct = COALESCE($6, fuel_level_end_pct),
                range_end_km  = COALESCE($7, range_end_km)
            WHERE id = $1
            """,
            trip_id, odometer_end, distance_km, fuel_used_l, avg_speed_kmh, fuel_level_pct, range_km,
        )

    async def list_trips(
        self, vin: str | None, limit: int, offset: int,
        since: datetime | None = None, until: datetime | None = None, with_route: bool = True,
    ) -> list[dict[str, Any]]:
        # Tracciato semplificato: all'elenco serve la forma del percorso per
        # l'anteprima, non la precisione al metro. ~50 m di tolleranza riduce
        # di molto i punti trasmessi. Le statistiche non lo chiedono affatto.
        route = "ST_AsGeoJSON(ST_Simplify(t.route::geometry, 0.0005))" if with_route else "NULL"
        rows = await self.pool.fetch(
            f"""
            SELECT {_TRIP_COLUMNS}, {route} AS route_geojson
            FROM trip_stats t {_TRIP_PLACES}
            WHERE ($1::text IS NULL OR t.vin = $1)
              AND ($4::timestamptz IS NULL OR t.started_at >= $4)
              AND ($5::timestamptz IS NULL OR t.started_at < $5)
            ORDER BY t.started_at DESC
            LIMIT $2 OFFSET $3
            """,
            vin, limit, offset, since, until,
        )
        return [_trip_from_row(r) for r in rows]

    async def get_trip(self, trip_id: UUID) -> dict[str, Any] | None:
        row = await self.pool.fetchrow(
            f"""
            SELECT {_TRIP_COLUMNS}, t.distance_km, t.distance_gps_km,
                   ST_AsGeoJSON(t.route::geometry) AS route_geojson
            FROM trip_stats t {_TRIP_PLACES}
            WHERE t.id = $1
            """,
            trip_id,
        )
        return _trip_from_row(row) if row else None

    async def update_trip(self, trip_id: UUID, fields: dict[str, Any]) -> dict[str, Any] | None:
        """Aggiorna i campi scelti dall'utente (etichetta, nota, indirizzi)."""
        allowed = {"tag", "note", "start_address", "end_address"}
        fields = {k: v for k, v in fields.items() if k in allowed}
        if fields:
            assignments = ", ".join(f"{k} = ${i}" for i, k in enumerate(fields, start=2))
            result = await self.pool.execute(
                f"UPDATE trip SET {assignments} WHERE id = $1", trip_id, *fields.values()
            )
            if result.endswith(" 0"):
                return None
        return await self.get_trip(trip_id)

    # -- luoghi -------------------------------------------------------------

    async def list_places(self) -> list[dict[str, Any]]:
        rows = await self.pool.fetch(f"SELECT {_PLACE_COLUMNS} FROM place ORDER BY created_at")
        return [_row_to_dict(r) for r in rows]

    async def create_place(
        self, name: str, icon: str, color: str, lat: float, lon: float, radius_m: int
    ) -> dict[str, Any]:
        row = await self.pool.fetchrow(
            f"""
            INSERT INTO place (name, icon, color, position, radius_m)
            VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint($5, $4), 4326)::geography, $6)
            RETURNING {_PLACE_COLUMNS}
            """,
            name, icon, color, lat, lon, radius_m,
        )
        return _row_to_dict(row)

    async def update_place(self, place_id: UUID, fields: dict[str, Any]) -> dict[str, Any] | None:
        sets, args = [], [place_id]
        for key in ("name", "icon", "color", "radius_m"):
            if key in fields:
                args.append(fields[key])
                sets.append(f"{key} = ${len(args)}")
        if "latitude" in fields and "longitude" in fields:
            args += [fields["longitude"], fields["latitude"]]
            sets.append(f"position = ST_SetSRID(ST_MakePoint(${len(args) - 1}, ${len(args)}), 4326)::geography")
        if not sets:
            row = await self.pool.fetchrow(f"SELECT {_PLACE_COLUMNS} FROM place WHERE id = $1", place_id)
        else:
            row = await self.pool.fetchrow(
                f"UPDATE place SET {', '.join(sets)} WHERE id = $1 RETURNING {_PLACE_COLUMNS}", *args
            )
        return _row_to_dict(row) if row else None

    async def delete_place(self, place_id: UUID) -> bool:
        result = await self.pool.execute("DELETE FROM place WHERE id = $1", place_id)
        return result.endswith(" 1")

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

    # -- prezzi carburante (MIMIT) -------------------------------------------

    async def replace_fuel_prices(self, stations: list[Any], prices: list[Any]) -> None:
        """Sostituisce l'intero snapshot con quello appena scaricato.

        MIMIT non offre un delta: ogni sync e' un dump completo, quindi il
        modo corretto di applicarlo e' svuotare e reinserire, non fare
        merge riga per riga (impianti chiusi o rimossi altrimenti
        resterebbero in giro per sempre).
        """
        station_ids = {s.id for s in stations}
        # I due CSV vengono scaricati separatamente e possono disallinearsi
        # (un prezzo per un impianto che non compare nell'anagrafica di
        # oggi): senza questo filtro l'INSERT fallirebbe per violazione
        # della foreign key e l'intero sync andrebbe perso.
        prices = [p for p in prices if p.station_id in station_ids]

        async with self.pool.acquire() as conn:
            async with conn.transaction():
                await conn.execute("TRUNCATE fuel_station CASCADE")
                if stations:
                    await conn.executemany(
                        """
                        INSERT INTO fuel_station
                            (id, brand, name, address, comune, provincia, position)
                        VALUES ($1, $2, $3, $4, $5, $6,
                                ST_SetSRID(ST_MakePoint($7, $8), 4326)::geography)
                        """,
                        [
                            (s.id, s.brand, s.name, s.address, s.comune, s.provincia, s.lon, s.lat)
                            for s in stations
                        ],
                    )
                if prices:
                    await conn.executemany(
                        """
                        INSERT INTO fuel_price
                            (station_id, fuel_type, is_self, price, communicated_at)
                        VALUES ($1, $2, $3, $4, $5)
                        ON CONFLICT (station_id, fuel_type, is_self) DO NOTHING
                        """,
                        [
                            (p.station_id, p.fuel_type, p.is_self, p.price, p.communicated_at)
                            for p in prices
                        ],
                    )

    async def fuel_price_status(self) -> dict[str, Any]:
        row = await self.pool.fetchrow(
            "SELECT count(*) AS stations, max(updated_at) AS synced_at FROM fuel_station"
        )
        return _row_to_dict(row)

    async def average_fuel_price_near(
        self, lat: float, lon: float, fuel_type: str, is_self: bool, radii_km: list[float]
    ) -> dict[str, Any] | None:
        """Prezzo medio nella zona, allargando il raggio finche' non trova
        un campione ragionevole (evita una media su un solo distributore
        isolato, che non e' rappresentativa)."""
        for radius_km in radii_km:
            row = await self.pool.fetchrow(
                """
                SELECT count(*)::int AS station_count, avg(fp.price)::numeric AS price
                FROM fuel_price fp
                JOIN fuel_station fs ON fs.id = fp.station_id
                WHERE fp.fuel_type = $1 AND fp.is_self = $2
                  AND ST_DWithin(
                        fs.position,
                        ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography,
                        $5
                      )
                """,
                fuel_type, is_self, lon, lat, radius_km * 1000,
            )
            if row and row["station_count"] >= 3:
                result = _row_to_dict(row)
                result["radius_km"] = radius_km
                return result
        return None

    async def national_average_fuel_price(self, fuel_type: str, is_self: bool) -> dict[str, Any] | None:
        row = await self.pool.fetchrow(
            "SELECT count(*)::int AS station_count, avg(price)::numeric AS price "
            "FROM fuel_price WHERE fuel_type = $1 AND is_self = $2",
            fuel_type, is_self,
        )
        if not row or not row["station_count"]:
            return None
        return _row_to_dict(row)

    async def nearby_fuel_prices(
        self, lat: float, lon: float, fuel_type: str, is_self: bool, radius_km: float, limit: int
    ) -> list[dict[str, Any]]:
        rows = await self.pool.fetch(
            """
            SELECT fs.id AS station_id, fs.name, fs.brand, fs.address, fs.comune,
                   ST_Y(fs.position::geometry) AS latitude,
                   ST_X(fs.position::geometry) AS longitude,
                   fp.price, fp.communicated_at,
                   ST_Distance(
                       fs.position, ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography
                   ) AS distance_m
            FROM fuel_price fp
            JOIN fuel_station fs ON fs.id = fp.station_id
            WHERE fp.fuel_type = $1 AND fp.is_self = $2
              AND ST_DWithin(
                    fs.position, ST_SetSRID(ST_MakePoint($3, $4), 4326)::geography, $5
                  )
            ORDER BY fp.price ASC
            LIMIT $6
            """,
            fuel_type, is_self, lon, lat, radius_km * 1000, limit,
        )
        return [_row_to_dict(r) for r in rows]


_TRIP_COLUMNS = """
    t.id, t.vin, t.started_at, t.ended_at, t.duration_s,
    t.distance_effective_km, t.l_per_100km, t.km_per_l,
    t.fuel_used_l, t.avg_speed_kmh, t.odometer_start, t.odometer_end,
    t.fuel_level_start_pct, t.fuel_level_end_pct, t.range_start_km, t.range_end_km,
    t.start_address, t.end_address, t.tag, t.note,
    ST_Y(t.start_position::geometry) AS start_lat,
    ST_X(t.start_position::geometry) AS start_lon,
    ST_Y(t.end_position::geometry)   AS end_lat,
    ST_X(t.end_position::geometry)   AS end_lon,
    sp.id AS start_place_id, ep.id AS end_place_id
"""

# Il luogo di partenza e di arrivo e' il piu' vicino fra quelli che
# contengono il punto nel loro raggio. Calcolato in lettura: un luogo salvato
# oggi riconosce anche i viaggi passati.
_TRIP_PLACES = """
    LEFT JOIN LATERAL (
        SELECT p.id FROM place p
        WHERE t.start_position IS NOT NULL AND ST_DWithin(p.position, t.start_position, p.radius_m)
        ORDER BY ST_Distance(p.position, t.start_position) LIMIT 1
    ) sp ON true
    LEFT JOIN LATERAL (
        SELECT p.id FROM place p
        WHERE t.end_position IS NOT NULL AND ST_DWithin(p.position, t.end_position, p.radius_m)
        ORDER BY ST_Distance(p.position, t.end_position) LIMIT 1
    ) ep ON true
"""

_PLACE_COLUMNS = """
    id, name, icon, color, radius_m, created_at,
    ST_Y(position::geometry) AS latitude, ST_X(position::geometry) AS longitude
"""


def _trip_from_row(row: asyncpg.Record) -> dict[str, Any]:
    trip = _row_to_dict(row)
    raw = trip.pop("route_geojson", None)
    trip["route"] = json.loads(raw)["coordinates"] if raw else []
    return trip


def _row_to_dict(row: asyncpg.Record) -> dict[str, Any]:
    out = dict(row)
    for key, value in out.items():
        # asyncpg restituisce le colonne numeric come Decimal; FastAPI le
        # serializza come stringa (per non perdere precisione), ma l'app
        # mobile si aspetta un number su cui chiamare .toFixed().
        if isinstance(value, Decimal):
            out[key] = float(value)
        # asyncpg restituisce jsonb come stringa se non e' registrato un codec.
        elif isinstance(value, str) and key in {"openings", "tire_pressures", "warnings", "eco_score", "params"}:
            out[key] = json.loads(value)
    return out
