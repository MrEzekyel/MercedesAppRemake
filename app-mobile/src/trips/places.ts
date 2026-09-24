/** Luoghi salvati: icone, colori e come si chiamano partenza e arrivo di un viaggio. */
import type { Place, PlaceIcon, TripSummary } from "../types";

/** Tracciati 24×24 a tratto, come il resto delle icone dell'app. */
export const PLACE_ICON_PATHS: Record<PlaceIcon, string> = {
  home: "M4 11.5 12 5l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5h-5v5H5a1 1 0 0 1-1-1z",
  work: "M4 8.5h16v10a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5zM9 8.5V6a1.5 1.5 0 0 1 1.5-1.5h3A1.5 1.5 0 0 1 15 6v2.5M4 13h16",
  gym: "M6.5 8v8M17.5 8v8M4 10v4M20 10v4M6.5 12h11",
  shop: "M4 5h2l2 10h10l2-7H7M9 19.5h.01M17 19.5h.01",
  heart: "M12 19.5s-7-4.3-7-9.2A3.8 3.8 0 0 1 12 8a3.8 3.8 0 0 1 7 2.3c0 4.9-7 9.2-7 9.2z",
  school: "M3 9l9-4 9 4-9 4zM7 11v5c3 2 7 2 10 0v-5",
  star: "M12 4.5l2.3 4.7 5.2.8-3.8 3.6.9 5.1-4.6-2.4-4.6 2.4.9-5.1-3.8-3.6 5.2-.8z",
  pin: "M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11zM12 12.3a2.3 2.3 0 1 0 0-4.6 2.3 2.3 0 0 0 0 4.6z",
};

export const PLACE_ICONS: { icon: PlaceIcon; label: string }[] = [
  { icon: "home", label: "Casa" },
  { icon: "work", label: "Lavoro" },
  { icon: "gym", label: "Palestra" },
  { icon: "shop", label: "Spesa" },
  { icon: "heart", label: "Persone care" },
  { icon: "school", label: "Scuola" },
  { icon: "star", label: "Preferito" },
  { icon: "pin", label: "Altro" },
];

/** Colori dei luoghi: diversi anche per luminosita', non solo per tinta. */
export const PLACE_COLORS = ["#4F8FD1", "#e0a63c", "#34c759", "#b49cf2", "#e58fb0", "#9aa3ad"];

export const RADIUS_CHOICES = [100, 200, 300, 500, 800];

export interface Endpoint {
  name: string;
  /** Colore del luogo salvato; null per un semplice indirizzo. */
  color: string | null;
  place: Place | null;
}

/** Nome del punto di partenza o arrivo: il luogo salvato, altrimenti la via. */
export function endpoint(
  trip: TripSummary, side: "start" | "end", places: Map<string, Place>, addresses?: Map<string, string>
): Endpoint {
  const placeId = side === "start" ? trip.start_place_id : trip.end_place_id;
  const place = placeId ? places.get(placeId) ?? null : null;
  if (place) return { name: place.name, color: place.color, place };
  const address =
    (side === "start" ? trip.start_address : trip.end_address) ?? addresses?.get(`${trip.id}:${side}`) ?? null;
  return { name: address ?? "Posizione", color: null, place: null };
}

/** "Casa → Lavoro", per i record e le frasi. */
export function describeTrip(trip: TripSummary, places: Map<string, Place>, addresses?: Map<string, string>): string {
  return `${endpoint(trip, "start", places, addresses).name} → ${endpoint(trip, "end", places, addresses).name}`;
}
