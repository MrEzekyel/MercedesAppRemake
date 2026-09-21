-- Aggiunge il tracciamento dei rifornimenti a un database gia' esistente.
-- Su un'installazione nuova basta db/schema.sql, che include gia' questa
-- tabella: questo file serve solo a chi ha applicato lo schema prima che
-- la tabella refuel esistesse.
--
--   psql -d mbcompanion -f db/migrations/0001_refuel.sql

CREATE TABLE IF NOT EXISTS refuel (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    vin                   text NOT NULL REFERENCES vehicle(vin) ON DELETE CASCADE,
    status                text NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'confirmed')),

    detected_at           timestamptz NOT NULL DEFAULT now(),
    odometer_km           integer,
    fuel_level_before_pct numeric(4,1),
    fuel_level_after_pct  numeric(4,1),
    liters_estimated      numeric(6,2),
    liters                numeric(6,2),
    cost_eur              numeric(7,2),
    full_tank             boolean NOT NULL DEFAULT true,
    position              geography(Point, 4326),
    notes                 text,

    confirmed_at          timestamptz
);

CREATE INDEX IF NOT EXISTS refuel_vin_detected_idx ON refuel (vin, detected_at DESC);

CREATE OR REPLACE VIEW refuel_stats AS
SELECT *,
    CASE WHEN liters > 0 THEN ROUND(cost_eur / liters, 3) END AS price_per_liter
FROM refuel;
