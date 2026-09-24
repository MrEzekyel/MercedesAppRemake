/**
 * Quanto e' costato un viaggio.
 *
 * L'auto dice quanti litri ha bruciato, non quanto sono costati: il prezzo
 * al litro arriva da qui. In ordine di fiducia:
 *   1. il valore impostato a mano dall'utente (vince sempre);
 *   2. la media dei rifornimenti gia' confermati, pesata sui litri, cosi'
 *      un pieno da 40 l conta piu' di un rabbocco da 5;
 *   3. la media MIMIT della zona (vedi useFuelPrice.ts: e' un fallback
 *      asincrono, non sincrono come i primi due);
 *   4. niente, e allora il costo non si mostra invece di inventarlo.
 */
import type { Refuel } from "./types";

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
