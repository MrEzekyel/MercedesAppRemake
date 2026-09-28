-- Percorso agganciato alle strade (vedi backend/app/mapmatch.py). Su
-- un'installazione nuova basta db/schema.sql, che lo include gia'.
--
--   psql -d mbcompanion -f db/migrations/0006_route_matched.sql
--   python -m app.mapmatch        # aggancia i viaggi gia' registrati

ALTER TABLE trip ADD COLUMN IF NOT EXISTS route_matched geography(LineString, 4326);

-- trip_stats espande t.* al momento della creazione: va ricreata.
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
