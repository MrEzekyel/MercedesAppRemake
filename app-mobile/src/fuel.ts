/**
 * Quanto e' costato un viaggio.
 *
 * L'auto dice quanti litri ha bruciato, non quanto sono costati: il prezzo
 * al litro arriva da qui. In ordine di fiducia:
 *   1. il valore impostato a mano dall'utente (vince sempre);
 *   2. la media dei rifornimenti gia' confermati, pesata sui litri, cosi'
 *      un pieno da 40 l conta piu' di un rabbocco da 5;
 *   3. niente, e allora il costo non si mostra invece di inventarlo.
 */
import type { Refuel } from "./types";

export type PriceSource = "manuale" | "media" | "assente";

export interface FuelPrice {
  value: number | null;
  source: PriceSource;
}

export function resolveFuelPrice(
  manual: number | null | undefined,
  refuels: Refuel[]
): FuelPrice {
  if (manual != null && manual > 0) return { value: manual, source: "manuale" };

  let liters = 0;
  let cost = 0;
  for (const r of refuels) {
    if (r.status !== "confirmed" || r.liters == null || r.liters <= 0) continue;
    const unit = r.price_per_liter ?? (r.cost_eur != null ? r.cost_eur / r.liters : null);
    if (unit == null || unit <= 0) continue;
    liters += r.liters;
    cost += unit * r.liters;
  }

  if (liters > 0) return { value: cost / liters, source: "media" };
  return { value: null, source: "assente" };
}

/**
 * Accetta sia il riepilogo sia il dettaglio del viaggio: di un viaggio qui
 * servono solo i litri, non l'intera riga.
 */
interface Consuming {
  fuel_used_l: number | null;
  distance_effective_km: number | null;
}

export function tripCost(trip: Consuming, price: number | null): number | null {
  if (price == null || trip.fuel_used_l == null) return null;
  return trip.fuel_used_l * price;
}

/** Costo al chilometro: il numero che dice davvero quanto pesa l'auto. */
export function costPerKm(trip: Consuming, price: number | null): number | null {
  const cost = tripCost(trip, price);
  if (cost == null || !trip.distance_effective_km) return null;
  return cost / trip.distance_effective_km;
}

/** Spesa reale di un rifornimento: il confermato vince sulla stima. */
export function refuelCost(refuel: Refuel, price: number | null): number | null {
  if (refuel.cost_eur != null) return refuel.cost_eur;
  const liters = refuel.liters ?? refuel.liters_estimated;
  if (liters == null) return null;
  const unit = refuel.price_per_liter ?? price;
  return unit == null ? null : liters * unit;
}

export function formatEur(value: number | null | undefined, decimals = 2): string {
  if (value == null) return "—";
  return `${value.toFixed(decimals).replace(".", ",")} €`;
}
