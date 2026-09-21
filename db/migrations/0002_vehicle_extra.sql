-- Aggiunge i campi per la schermata "Stato del veicolo" a un database
-- gia' esistente. Su un'installazione nuova basta db/schema.sql, che li
-- include gia': questo file serve solo a chi ha applicato lo schema prima.
--
--   psql -d mbcompanion -f db/migrations/0002_vehicle_extra.sql

ALTER TABLE vehicle_state ADD COLUMN IF NOT EXISTS park_brake_engaged boolean;
ALTER TABLE vehicle_state ADD COLUMN IF NOT EXISTS eco_score jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE vehicle_state ADD COLUMN IF NOT EXISTS service_interval_days integer;
