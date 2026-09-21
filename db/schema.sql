-- MB Companion - schema
-- Postgres 14+ con PostGIS 3+

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- Veicoli
-- ---------------------------------------------------------------------------

CREATE TABLE vehicle (
    vin             text PRIMARY KEY,
    display_name    text NOT NULL,
    model           text,
    -- Litri: serve per stimare l'autonomia e per convertire il livello % in litri.
    tank_capacity_l numeric(5,1),
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Stato corrente
--
-- Una riga per veicolo, aggiornata in place dagli eventi push. L'app legge
-- sempre e solo da qui: e' gia' l'ultimo stato noto, nessuna aggregazione.
-- ---------------------------------------------------------------------------

CREATE TABLE vehicle_state (
    vin                 text PRIMARY KEY REFERENCES vehicle(vin) ON DELETE CASCADE,
    updated_at          timestamptz NOT NULL DEFAULT now(),

    position            geography(Point, 4326),
    heading             numeric(4,1),
    position_updated_at timestamptz,

    odometer_km         integer,
    fuel_level_pct      numeric(4,1),
    range_km            integer,

    ignition_state      text,
    engine_running      boolean,

    doors_locked        boolean,
    -- Stato per singola apertura: {"driver_front": "open", "sunroof": "tilt", ...}
    openings            jsonb NOT NULL DEFAULT '{}'::jsonb,

    tire_pressures      jsonb NOT NULL DEFAULT '{}'::jsonb,
    warnings            jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- ---------------------------------------------------------------------------
-- Viaggi
--
-- L'API Mercedes non espone uno storico viaggi: i contatori di bordo
-- (distanceStart / liquidconsumptionstart / averageSpeedStart) sono valori
-- istantanei che si azzerano. Il viaggio lo costruiamo noi: apertura su
-- ignition ON, chiusura su ignition OFF.
-- ---------------------------------------------------------------------------

CREATE TABLE trip (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    vin             text NOT NULL REFERENCES vehicle(vin) ON DELETE CASCADE,

    started_at      timestamptz NOT NULL,
    ended_at        timestamptz,

    odometer_start  integer,
    odometer_end    integer,

    -- Distanza dai contatori di bordo. Fonte primaria: e' la misura della
    -- macchina, non una stima. Puo' mancare se l'auto non la riporta a fine
    -- viaggio, per questo teniamo anche distance_gps_km come fallback.
    distance_km     numeric(7,2),
    -- Ricalcolata da PostGIS sulla traccia. Meno precisa (dipende dal
    -- campionamento) ma sempre disponibile.
    distance_gps_km numeric(7,2),

    -- Grandezze grezze: litri e km. Qualunque unita' di consumo
    -- (L/100km o km/L) si deriva da queste due in lettura, cosi' l'app puo'
    -- mostrare l'una o l'altra senza migrare i dati.
    fuel_used_l     numeric(6,2),
    avg_speed_kmh   numeric(5,1),

    start_position  geography(Point, 4326),
    end_position    geography(Point, 4326),
    start_address   text,
    end_address     text,

    -- Traccia completa, materializzata alla chiusura del viaggio a partire
    -- da trip_point. Evita di ricostruire la linea a ogni apertura della mappa.
    route           geography(LineString, 4326),

    created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX trip_vin_started_idx ON trip (vin, started_at DESC);
-- Un solo viaggio aperto per veicolo: rende impossibile perdere una chiusura
-- e ritrovarsi con due tracce che si sovrappongono.
CREATE UNIQUE INDEX trip_one_open_per_vin ON trip (vin) WHERE ended_at IS NULL;

CREATE VIEW trip_stats AS
SELECT
    t.*,
    EXTRACT(EPOCH FROM (t.ended_at - t.started_at))::integer AS duration_s,
    COALESCE(t.distance_km, t.distance_gps_km)               AS distance_effective_km,
    CASE WHEN COALESCE(t.distance_km, t.distance_gps_km) > 0
         THEN t.fuel_used_l * 100 / COALESCE(t.distance_km, t.distance_gps_km)
    END                                                      AS l_per_100km,
    CASE WHEN t.fuel_used_l > 0
         THEN COALESCE(t.distance_km, t.distance_gps_km) / t.fuel_used_l
    END                                                      AS km_per_l
FROM trip t;

-- ---------------------------------------------------------------------------
-- Briciole GPS
-- ---------------------------------------------------------------------------

CREATE TABLE trip_point (
    trip_id     uuid NOT NULL REFERENCES trip(id) ON DELETE CASCADE,
    recorded_at timestamptz NOT NULL,
    position    geography(Point, 4326) NOT NULL,
    heading     numeric(4,1),
    odometer_km integer,
    PRIMARY KEY (trip_id, recorded_at)
);

-- ---------------------------------------------------------------------------
-- Eventi grezzi
--
-- Ogni messaggio decodificato dal websocket, prima dell'interpretazione.
-- Serve a rigiocare i viaggi quando cambiamo la logica di rilevamento senza
-- dover riguidare l'auto per testare.
-- ---------------------------------------------------------------------------

CREATE TABLE raw_event (
    id          bigserial PRIMARY KEY,
    vin         text,
    received_at timestamptz NOT NULL DEFAULT now(),
    event_type  text,
    payload     jsonb NOT NULL
);

CREATE INDEX raw_event_vin_received_idx ON raw_event (vin, received_at DESC);

-- ---------------------------------------------------------------------------
-- Comandi
-- ---------------------------------------------------------------------------

CREATE TABLE command_log (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    vin          text NOT NULL REFERENCES vehicle(vin) ON DELETE CASCADE,
    command      text NOT NULL,
    params       jsonb NOT NULL DEFAULT '{}'::jsonb,
    requested_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz,
    status       text NOT NULL DEFAULT 'pending',
    error        text
);

CREATE INDEX command_log_vin_requested_idx ON command_log (vin, requested_at DESC);

-- ---------------------------------------------------------------------------
-- Dispositivi per le notifiche push
-- ---------------------------------------------------------------------------

CREATE TABLE device (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    expo_token  text NOT NULL UNIQUE,
    label       text,
    created_at  timestamptz NOT NULL DEFAULT now(),
    last_seen_at timestamptz
);
