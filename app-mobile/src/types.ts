/**
 * Rispecchiano esattamente le righe restituite da backend/app/db.py.
 * FastAPI passa le righe attraverso jsonable_encoder, che converte i
 * Decimal di Postgres in number prima del JSON (verificato), quindi qui
 * sono number a tutti gli effetti, non stringhe da fare Number() a mano.
 */

export interface VehicleState {
  vin: string;
  display_name: string;
  tank_capacity_l: number | null;
  updated_at: string | null;
  latitude: number | null;
  longitude: number | null;
  heading: number | null;
  position_updated_at: string | null;
  odometer_km: number | null;
  fuel_level_pct: number | null;
  range_km: number | null;
  ignition_state: string | null;
  engine_running: boolean | null;
  doors_locked: boolean | null;
  park_brake_engaged: boolean | null;
  openings: Record<string, string>;
  tire_pressures: Record<string, number>;
  warnings: Record<string, boolean>;
  eco_score: Record<string, number>;
  service_interval_days: number | null;
}

export interface TripSummary {
  id: string;
  vin: string;
  started_at: string;
  ended_at: string | null;
  duration_s: number | null;
  distance_effective_km: number | null;
  l_per_100km: number | null;
  km_per_l: number | null;
  fuel_used_l: number | null;
  avg_speed_kmh: number | null;
  odometer_start: number | null;
  odometer_end: number | null;
  start_lat: number | null;
  start_lon: number | null;
  end_lat: number | null;
  end_lon: number | null;
}

export interface TripDetail extends Omit<TripSummary, "start_lat" | "start_lon" | "end_lat" | "end_lon"> {
  distance_km: number | null;
  distance_gps_km: number | null;
  /** Coppie [longitudine, latitudine], come da GeoJSON. */
  route: [number, number][];
}

export type RefuelStatus = "pending" | "confirmed";

export interface Refuel {
  id: string;
  vin: string;
  status: RefuelStatus;
  detected_at: string;
  odometer_km: number | null;
  fuel_level_before_pct: number | null;
  fuel_level_after_pct: number | null;
  liters_estimated: number | null;
  liters: number | null;
  cost_eur: number | null;
  price_per_liter: number | null;
  full_tank: boolean;
  notes: string | null;
  confirmed_at: string | null;
}
