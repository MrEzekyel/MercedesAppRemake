/**
 * Quanto e' costato un viaggio.
 *
 * Il costo vero lo calcola il backend col metodo FIFO (backend/app/
 * fuel_cost.py): ogni litro bruciato e' prezzato col rifornimento da cui
 * proviene. Restano senza prezzo solo i litri di origine sconosciuta: il
 * carburante gia' nel serbatoio al primo rifornimento registrato, o quello
 * di un rifornimento non ancora confermato. Quelli, e solo quelli, si
 * prezzano col prezzo di riserva, in ordine di fiducia:
 *   1. il valore impostato a mano dall'utente;
 *   2. la media dei rifornimenti gia' confermati, pesata sui litri, cosi'
 *      un pieno da 40 l conta piu' di un rabbocco da 5;
 *   3. la media MIMIT della zona (vedi useFuelPrice.ts: e' un fallback
 *      asincrono, non sincrono come i primi due);
 *   4. niente, e allora il costo non si mostra invece di inventarlo.
 */
import type { Refuel, TripSummary } from "./types";

/**
 * Costo del viaggio: la parte FIFO piu' i litri senza prezzo al prezzo di
 * riserva. null se servirebbe il prezzo di riserva e non c'e'.
 */
export function tripCost(t: TripSummary, fallbackPrice: number | null): number | null {
  if (t.cost_eur == null) {
    // Backend precedente al FIFO: tutto al prezzo di riserva, come prima.
    return fallbackPrice != null && t.fuel_used_l != null ? t.fuel_used_l * fallbackPrice : null;
  }
  const uncovered = t.cost_uncovered_l ?? 0;
  if (uncovered <= 0) return t.cost_eur;
  return fallbackPrice != null ? t.cost_eur + uncovered * fallbackPrice : null;
}

export type PriceSource = "manuale" | "media" | "mimit" | "assente";

export interface FuelPrice {
  value: number | null;
  source: PriceSource;
  /** Solo per source "mimit": una riga che spiega da dove viene il numero. */
  detail?: string;
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
