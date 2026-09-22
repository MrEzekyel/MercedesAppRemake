/**
 * Prezzo carburante da usare per i costi, in un solo posto invece che
 * ripetuto in ogni schermata che ne ha bisogno (Viaggi, Consumi, dettaglio
 * viaggio). Tre livelli, in ordine di fiducia:
 *   1. impostato a mano dall'utente (resolveFuelPrice, sincrono);
 *   2. media dei suoi rifornimenti confermati (resolveFuelPrice, sincrono);
 *   3. media MIMIT della zona (o nazionale), presa al volo solo se serve:
 *      un utente che ha gia' rifornimenti non deve aspettare una chiamata
 *      di rete in piu' per vedere un numero che conosce gia'.
 */
import { useEffect, useState } from "react";
import { api } from "./api";
import { type FuelPrice, resolveFuelPrice } from "./fuel";
import type { Refuel, VehicleState } from "./types";

export function useFuelPrice(state: VehicleState | null, refuels: Refuel[]): FuelPrice {
  const base = resolveFuelPrice(state?.fuel_price_eur_per_l, refuels);
  const [mimit, setMimit] = useState<FuelPrice | null>(null);

  useEffect(() => {
    if (base.source !== "assente" || !state?.vin) {
      setMimit(null);
      return;
    }
    let cancelled = false;
    api
      .getFuelPriceAverage(state.vin)
      .then((avg) => {
        if (cancelled) return;
        const detail =
          avg.source === "locale"
            ? `Media di ${avg.station_count} distributori entro ${avg.radius_km} km (MIMIT)`
            : `Media nazionale, nessun distributore vicino (MIMIT)`;
        setMimit({ value: avg.price, source: "mimit", detail });
      })
      .catch(() => {
        // Nessun rifornimento e MIMIT irraggiungibile: resta "assente",
        // non e' un errore da mostrare, solo un dato che non c'e' ancora.
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base.source, state?.vin]);

  return base.source !== "assente" ? base : (mimit ?? base);
}
