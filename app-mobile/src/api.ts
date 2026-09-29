import type { Place, PlaceIcon, Refuel, TripDetail, TripSummary, VehicleState } from "./types";

let API_BASE_URL = "http://localhost:8000";
let API_AUTH_TOKEN = "";

try {
  // config.ts e' gitignored (vedi config.example.ts): se manca, l'app resta
  // avviabile ma ogni chiamata fallira' con un errore chiaro invece di un
  // crash all'avvio sull'import mancante.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const local = require("./config");
  API_BASE_URL = local.API_BASE_URL;
  API_AUTH_TOKEN = local.API_AUTH_TOKEN;
} catch {
  console.warn(
    "app-mobile/src/config.ts mancante: copia config.example.ts in config.ts e compilalo."
  );
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${API_AUTH_TOKEN}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new ApiError(res.status, body || res.statusText);
  }
  return res.json() as Promise<T>;
}

export const api = {
  getState: (vin?: string): Promise<VehicleState[]> =>
    request(`/api/state${vin ? `?vin=${vin}` : ""}`),

  /**
   * Con since/until: i viaggi iniziati nel periodo (until escluso).
   * route=false toglie il tracciato, che alle statistiche non serve.
   */
  listTrips: (
    opts: { vin?: string; limit?: number; offset?: number; since?: Date; until?: Date; route?: boolean } = {}
  ): Promise<TripSummary[]> => {
    const params = new URLSearchParams();
    if (opts.vin) params.set("vin", opts.vin);
    params.set("limit", String(opts.limit ?? 50));
    params.set("offset", String(opts.offset ?? 0));
    if (opts.since) params.set("since", opts.since.toISOString());
    if (opts.until) params.set("until", opts.until.toISOString());
    if (opts.route === false) params.set("route", "false");
    return request(`/api/trips?${params}`);
  },

  getTrip: (id: string): Promise<TripDetail> => request(`/api/trips/${id}`),

  /** Solo i campi presenti cambiano; null cancella. */
  updateTrip: (
    id: string,
    body: Partial<Pick<TripSummary, "tag" | "note" | "start_address" | "end_address">>
  ): Promise<TripDetail> => request(`/api/trips/${id}`, { method: "PATCH", body: JSON.stringify(body) }),

  listPlaces: (): Promise<Place[]> => request("/api/places"),

  createPlace: (body: PlaceInput): Promise<Place> =>
    request("/api/places", { method: "POST", body: JSON.stringify(body) }),

  updatePlace: (id: string, body: Partial<PlaceInput>): Promise<Place> =>
    request(`/api/places/${id}`, { method: "PATCH", body: JSON.stringify(body) }),

  deletePlace: (id: string): Promise<{ deleted: boolean }> =>
    request(`/api/places/${id}`, { method: "DELETE" }),

  /** null rimette il prezzo automatico (media dei rifornimenti). */
  setFuelPrice: (vin: string, price: number | null): Promise<{ fuel_price_eur_per_l: number | null }> =>
    request(`/api/vehicles/${vin}/settings`, {
      method: "PATCH",
      body: JSON.stringify({ fuel_price_eur_per_l: price }),
    }),

  /**
   * Prezzo medio locale (o nazionale se in zona non ci sono abbastanza
   * distributori) dagli open data MIMIT, ultimo fallback quando non c'e'
   * ne' un prezzo impostato a mano ne' uno storico di rifornimenti.
   */
  getFuelPriceAverage: (vin: string): Promise<FuelPriceAverage> =>
    request(`/api/fuel-prices/average?vin=${vin}`),

  getNearbyFuelPrices: (vin: string, radiusKm = 15, limit = 10): Promise<NearbyFuelPrice[]> =>
    request(`/api/fuel-prices/nearby?vin=${vin}&radius_km=${radiusKm}&limit=${limit}`),

  listRefuels: (
    opts: { vin?: string; status?: "pending" | "confirmed"; limit?: number } = {}
  ): Promise<Refuel[]> => {
    const params = new URLSearchParams();
    if (opts.vin) params.set("vin", opts.vin);
    if (opts.status) params.set("status", opts.status);
    params.set("limit", String(opts.limit ?? 50));
    return request(`/api/refuels?${params}`);
  },

  confirmRefuel: (
    id: string,
    body: { liters: number; cost_eur?: number | null; full_tank: boolean; notes?: string | null }
  ): Promise<Refuel> =>
    request(`/api/refuels/${id}/confirm`, { method: "POST", body: JSON.stringify(body) }),

  deleteRefuel: (id: string): Promise<{ deleted: boolean }> =>
    request(`/api/refuels/${id}`, { method: "DELETE" }),

  lock: (vin: string): Promise<CommandResult> =>
    request(`/api/vehicles/${vin}/lock`, { method: "POST" }),

  unlock: (vin: string): Promise<CommandResult> =>
    request(`/api/vehicles/${vin}/unlock`, { method: "POST" }),

  climateStart: (vin: string): Promise<CommandResult> =>
    request(`/api/vehicles/${vin}/climate/start`, { method: "POST" }),

  climateStop: (vin: string): Promise<CommandResult> =>
    request(`/api/vehicles/${vin}/climate/stop`, { method: "POST" }),

  flashLights: (vin: string): Promise<CommandResult> =>
    request(`/api/vehicles/${vin}/lights`, { method: "POST" }),

  sound: (vin: string): Promise<CommandResult> =>
    request(`/api/vehicles/${vin}/horn`, { method: "POST" }),

  windowsOpen: (vin: string): Promise<CommandResult> =>
    request(`/api/vehicles/${vin}/windows/open`, { method: "POST" }),

  windowsClose: (vin: string): Promise<CommandResult> =>
    request(`/api/vehicles/${vin}/windows/close`, { method: "POST" }),

  getCommand: (id: string): Promise<CommandStatus> => request(`/api/commands/${id}`),
};

export interface PlaceInput {
  name: string;
  icon: PlaceIcon;
  color: string;
  latitude: number;
  longitude: number;
  radius_m: number;
}

export interface CommandResult {
  command_id: string;
  status: string;
}

export interface CommandStatus {
  id: string;
  vin: string;
  command: string;
  status: "pending" | "completed" | "failed";
  error: string | null;
}

export interface FuelPriceAverage {
  price: number;
  station_count: number;
  /** Assente quando la stima e' nazionale invece che locale. */
  radius_km?: number;
  fuel_type: string;
  source: "locale" | "nazionale";
}

export interface NearbyFuelPrice {
  station_id: number;
  name: string | null;
  brand: string | null;
  address: string | null;
  comune: string | null;
  latitude: number;
  longitude: number;
  price: number;
  communicated_at: string | null;
  distance_m: number;
}
