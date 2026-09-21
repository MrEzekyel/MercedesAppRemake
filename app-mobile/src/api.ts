import type { Refuel, TripDetail, TripSummary, VehicleState } from "./types";

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

  listTrips: (opts: { vin?: string; limit?: number; offset?: number } = {}): Promise<TripSummary[]> => {
    const params = new URLSearchParams();
    if (opts.vin) params.set("vin", opts.vin);
    params.set("limit", String(opts.limit ?? 50));
    params.set("offset", String(opts.offset ?? 0));
    return request(`/api/trips?${params}`);
  },

  getTrip: (id: string): Promise<TripDetail> => request(`/api/trips/${id}`),

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
};
