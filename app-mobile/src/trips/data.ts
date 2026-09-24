/**
 * Dati del resoconto viaggi, condivisi fra le schermate.
 *
 * Una piccola cache in memoria: passando da Viaggi a Consumi e ritorno i
 * numeri si vedono subito, e intanto si ricaricano sotto. Senza, ogni
 * schermata partirebbe vuota per il tempo di una chiamata.
 */
import * as Location from "expo-location";
import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError } from "../api";
import type { Place, Refuel, TripSummary, VehicleState } from "../types";
import { useFuelPrice } from "../useFuelPrice";

const cache = new Map<string, unknown>();
/** Chiavi da ricaricare al prossimo focus anche se appena caricate. */
const stale = new Set<string>();

function useCached<T>(key: string | null, load: () => Promise<T>, initial: T) {
  const [value, setValue] = useState<T>(() => (key && cache.has(key) ? (cache.get(key) as T) : initial));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const loadRef = useRef(load);
  loadRef.current = load;
  const lastLoad = useRef(0);

  const reload = useCallback(async () => {
    if (!key) return;
    lastLoad.current = Date.now();
    setLoading(true);
    try {
      const fresh = await loadRef.current();
      cache.set(key, fresh);
      setValue(fresh);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Backend non raggiungibile");
    } finally {
      setLoading(false);
    }
  }, [key]);

  useEffect(() => {
    if (key && cache.has(key)) setValue(cache.get(key) as T);
    reload();
  }, [key, reload]);

  // Al ritorno sulla schermata; non al primo focus, gia' coperto sopra.
  useFocusEffect(
    useCallback(() => {
      if (key && stale.delete(key)) reload();
      else if (Date.now() - lastLoad.current > 2000) reload();
    }, [key, reload])
  );

  return { value, error, loading, reload };
}

/** Stato dell'auto, rifornimenti, luoghi e prezzo al litro usato per i costi. */
export function useBasics() {
  const state = useCached<VehicleState | null>("state", async () => (await api.getState())[0] ?? null, null);
  const refuels = useCached<Refuel[]>("refuels", () => api.listRefuels({ limit: 200 }), []);
  const places = useCached<Place[]>("places", () => api.listPlaces(), []);
  const price = useFuelPrice(state.value, refuels.value);
  const placeMap = useMemo(() => new Map(places.value.map((p) => [p.id, p])), [places.value]);
  return {
    state: state.value,
    refuels: refuels.value,
    places: places.value,
    placeMap,
    price,
    error: state.error ?? refuels.error ?? places.error,
    reload: async () => {
      await Promise.all([state.reload(), refuels.reload(), places.reload()]);
    },
    reloadPlaces: places.reload,
  };
}

/** Dopo aver salvato o eliminato un luogo: tutti i viaggi cambiano nome. */
export function invalidatePlaces() {
  stale.add("places");
  for (const key of cache.keys()) if (key.startsWith("trips:")) stale.add(key);
}

/** Viaggi iniziati fra since e until (escluso). */
export function useTrips(range: { start: Date; end: Date } | null, opts: { route?: boolean } = {}) {
  const route = opts.route ?? false;
  // Arrotondato al minuto: "adesso" cambia a ogni render, la chiave no.
  const key = range
    ? `trips:${range.start.getTime()}:${Math.floor(range.end.getTime() / 60000)}:${route}`
    : null;
  const res = useCached<TripSummary[]>(
    key,
    () => api.listTrips({ since: range?.start, until: range?.end, limit: 2000, route }),
    []
  );
  return { trips: res.value, error: res.error, loading: res.loading, reload: res.reload };
}

// -- indirizzi ----------------------------------------------------------------

const geocoded = new Map<string, string | null>();

/**
 * La via senza numero civico: basta a riconoscerla ed e' corta. In campagna
 * Apple mette il CAP nel nome: meglio la frazione o il comune.
 */
export function placeLabel(p: Location.LocationGeocodedAddress): string | null {
  const name = p.name && !/^\d+$/.test(p.name) ? p.name : null;
  return p.street ?? name ?? p.district ?? p.city ?? null;
}

export async function addressAt(lat: number, lon: number): Promise<string | null> {
  // ~10 m: due arrivi nello stesso parcheggio fanno una sola richiesta.
  const key = `${lat.toFixed(4)},${lon.toFixed(4)}`;
  if (geocoded.has(key)) return geocoded.get(key) ?? null;
  try {
    const [place] = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lon });
    const label = place ? placeLabel(place) : null;
    geocoded.set(key, label);
    return label;
  } catch {
    // Apple limita le richieste al minuto: un errore non si ricorda, si
    // riprova alla prossima apertura.
    return null;
  }
}

/**
 * Indirizzi dei viaggi che ancora non ce l'hanno. Il geocoding lo fa il
 * telefono (Apple, niente permessi da chiedere); il risultato si salva sul
 * viaggio, cosi' la volta dopo arriva gia' dal backend. Chiave: "id:start"
 * o "id:end".
 */
export function useAddresses(trips: TripSummary[], placeMap: Map<string, Place>, limit = 30): Map<string, string> {
  const [found, setFound] = useState<Map<string, string>>(new Map());
  const pending = useMemo(
    () =>
      trips
        .filter((t) => t.ended_at != null)
        .slice(0, limit)
        .flatMap((t) => {
          const out: { trip: TripSummary; side: "start" | "end"; lat: number; lon: number }[] = [];
          if (!t.start_place_id && !t.start_address && t.start_lat != null && t.start_lon != null)
            out.push({ trip: t, side: "start", lat: t.start_lat, lon: t.start_lon });
          if (!t.end_place_id && !t.end_address && t.end_lat != null && t.end_lon != null)
            out.push({ trip: t, side: "end", lat: t.end_lat, lon: t.end_lon });
          return out;
        }),
    // placeMap: un luogo nuovo rende inutile l'indirizzo di quei viaggi.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [trips, placeMap, limit]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const item of pending) {
        if (cancelled) return;
        const key = `${item.trip.id}:${item.side}`;
        const label = await addressAt(item.lat, item.lon);
        if (!label || cancelled) continue;
        setFound((prev) => new Map(prev).set(key, label));
        api
          .updateTrip(item.trip.id, item.side === "start" ? { start_address: label } : { end_address: label })
          .catch(() => {
            // Non salvato: si ricalcolera' la prossima volta, niente di grave.
          });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pending]);

  return found;
}

/** Via di ciascun punto, per le mete non ancora salvate (chiave libera). */
export function usePointLabels(points: { key: string; lat: number; lon: number }[]): Map<string, string> {
  const [labels, setLabels] = useState<Map<string, string>>(new Map());
  const signature = points.map((p) => p.key).join("|");
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const p of points) {
        const label = await addressAt(p.lat, p.lon);
        if (cancelled) return;
        if (label) setLabels((prev) => new Map(prev).set(p.key, label));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);
  return labels;
}
