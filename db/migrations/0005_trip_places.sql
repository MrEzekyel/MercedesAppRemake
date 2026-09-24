-- Resoconto viaggi: luoghi salvati, etichetta e nota del viaggio, serbatoio
-- e autonomia a inizio e fine viaggio. Su un'installazione nuova basta
-- db/schema.sql, che li include gia'.
--
--   psql -d mbcompanion -f db/migrations/0005_trip_places.sql

ALTER TABLE trip ADD COLUMN IF NOT EXISTS tag text;
ALTER TABLE trip ADD COLUMN IF NOT EXISTS note text;
ALTER TABLE trip ADD COLUMN IF NOT EXISTS fuel_level_start_pct numeric(4,1);
ALTER TABLE trip ADD COLUMN IF NOT EXISTS fuel_level_end_pct numeric(4,1);
ALTER TABLE trip ADD COLUMN IF NOT EXISTS range_start_km integer;
ALTER TABLE trip ADD COLUMN IF NOT EXISTS range_end_km integer;

-- trip_stats espande t.* al momento della creazione: senza ricrearla le
-- colonne nuove non comparirebbero.
DROP VIEW IF EXISTS trip_stats;
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

-- Luoghi salvati dall'utente (Casa, Lavoro...). Un viaggio parte o arriva
-- in un luogo se il suo punto cade entro radius_m: si parcheggia spesso un
-- po' piu' in la' della destinazione.
CREATE TABLE IF NOT EXISTS place (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name        text NOT NULL,
    icon        text NOT NULL DEFAULT 'pin',
    color       text NOT NULL DEFAULT '#4F8FD1',
    position    geography(Point, 4326) NOT NULL,
    radius_m    integer NOT NULL DEFAULT 300 CHECK (radius_m BETWEEN 50 AND 2000),
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS place_position_idx ON place USING gist (position);
