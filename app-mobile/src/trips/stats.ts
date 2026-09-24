/**
 * Statistiche del resoconto viaggi, calcolate sui viaggi gia' scaricati.
 *
 * Tutto qui e' puro (niente rete, niente React): le schermate chiedono i
 * viaggi del periodo al backend e da qui ricavano totali, serie per il
 * grafico, luoghi, abitudini e record.
 */
import type { Place, Refuel, TripSummary } from "../types";
import type { Bucket } from "./period";

export type Metric = "km" | "trips" | "time" | "cost";

export interface Totals {
  km: number;
  trips: number;
  seconds: number;
  /** Litri dei soli viaggi di cui l'auto ha mandato il consumo. */
  liters: number;
  /** Km di quegli stessi viaggi: consumo = liters / kmWithFuel. */
  kmWithFuel: number;
  lPer100: number | null;
  cost: number | null;
  costPerKm: number | null;
}

export const closedTrips = (trips: TripSummary[]) => trips.filter((t) => t.ended_at != null);

const kmOf = (t: TripSummary) => t.distance_effective_km ?? 0;

export function totals(trips: TripSummary[], price: number | null): Totals {
  let km = 0, seconds = 0, liters = 0, kmWithFuel = 0;
  const closed = closedTrips(trips);
  for (const t of closed) {
    km += kmOf(t);
    seconds += t.duration_s ?? 0;
    if (t.fuel_used_l != null && t.distance_effective_km) {
      liters += t.fuel_used_l;
      kmWithFuel += t.distance_effective_km;
    }
  }
  const lPer100 = kmWithFuel > 0 && liters > 0 ? (liters / kmWithFuel) * 100 : null;
  const cost = price != null && liters > 0 ? liters * price : null;
  const costPerKm = cost != null && kmWithFuel > 0 ? cost / kmWithFuel : null;
  return { km, trips: closed.length, seconds, liters, kmWithFuel, lPer100, cost, costPerKm };
}

/** Variazione relativa, null se non confrontabile. */
export function delta(cur: number | null, prev: number | null): number | null {
  if (cur == null || prev == null || prev === 0) return null;
  return (cur - prev) / prev;
}

export function metricOf(t: TripSummary, metric: Metric, price: number | null): number {
  switch (metric) {
    case "km":
      return kmOf(t);
    case "trips":
      return 1;
    case "time":
      return (t.duration_s ?? 0) / 60;
    case "cost":
      return price != null && t.fuel_used_l != null ? t.fuel_used_l * price : 0;
  }
}

/** Somma per colonna del grafico; null per le colonne nel futuro. */
export function series(trips: TripSummary[], buckets: Bucket[], metric: Metric, price: number | null): (number | null)[] {
  const values: (number | null)[] = buckets.map((b) => (b.future ? null : 0));
  for (const t of closedTrips(trips)) {
    const at = new Date(t.started_at);
    const i = buckets.findIndex((b) => at >= b.start && at < b.end);
    if (i >= 0 && values[i] != null) values[i] = (values[i] as number) + metricOf(t, metric, price);
  }
  return values;
}

/** Consumo medio per colonna (L/100 km), null dove non ci sono dati. */
export function consumptionSeries(trips: TripSummary[], buckets: Bucket[]): (number | null)[] {
  return buckets.map((b) => {
    const inside = closedTrips(trips).filter((t) => {
      const at = new Date(t.started_at);
      return at >= b.start && at < b.end;
    });
    const tt = totals(inside, null);
    return tt.lPer100;
  });
}

export interface DistanceBucket {
  label: string;
  count: number;
  lPer100: number | null;
}

const DISTANCE_EDGES: [number, number, string][] = [
  [0, 5, "0–5 km"],
  [5, 10, "5–10 km"],
  [10, 25, "10–25 km"],
  [25, 50, "25–50 km"],
  [50, 100, "50–100 km"],
  [100, Infinity, "oltre 100"],
];

export function distanceBuckets(trips: TripSummary[]): DistanceBucket[] {
  return DISTANCE_EDGES.map(([lo, hi, label]) => {
    const inside = closedTrips(trips).filter((t) => kmOf(t) >= lo && kmOf(t) < hi);
    return { label, count: inside.length, lPer100: totals(inside, null).lPer100 };
  });
}

/**
 * Una frase che dice qualcosa che i numeri da soli non dicono. Null se non
 * c'e' niente di interessante: meglio niente che una frase di riempitivo.
 */
export function insight(trips: TripSummary[], prev: TripSummary[], previousName: string | null): string | null {
  const all = totals(trips, null);
  const short = closedTrips(trips).filter((t) => kmOf(t) > 0 && kmOf(t) < 5 && t.fuel_used_l != null);
  const shortCons = totals(short, null).lPer100;
  if (short.length >= 3 && shortCons != null && all.lPer100 != null && shortCons > all.lPer100 * 1.1) {
    const extra = Math.round((shortCons / all.lPer100 - 1) * 100);
    return `I ${short.length} viaggi sotto i 5 km consumano in media ${fmt(shortCons)} L/100 km, il ${extra}% più della tua media.`;
  }
  const d = delta(all.lPer100, totals(prev, null).lPer100);
  if (d != null && previousName && Math.abs(d) >= 0.03) {
    const word = d < 0 ? "sceso" : "salito";
    return `Il consumo è ${word} del ${fmt(Math.abs(d) * 100)}% rispetto a ${previousName}: ${fmt(all.lPer100 as number)} L/100 km.`;
  }
  return null;
}

const fmt = (v: number) => v.toLocaleString("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

// -- abitudini --------------------------------------------------------------

export const HEAT_BANDS: [number, number, string][] = [
  [0, 6, "0–6"],
  [6, 9, "6–9"],
  [9, 12, "9–12"],
  [12, 15, "12–15"],
  [15, 18, "15–18"],
  [18, 21, "18–21"],
  [21, 24, "21–24"],
];

/** Viaggi per giorno della settimana (lunedi' prima) e fascia oraria. */
export function heatmap(trips: TripSummary[]): number[][] {
  const grid = Array.from({ length: 7 }, () => HEAT_BANDS.map(() => 0));
  for (const t of closedTrips(trips)) {
    const d = new Date(t.started_at);
    const row = (d.getDay() + 6) % 7;
    const col = HEAT_BANDS.findIndex(([lo, hi]) => d.getHours() >= lo && d.getHours() < hi);
    grid[row][col] += 1;
  }
  return grid;
}

export interface PlaceStat {
  place: Place;
  visits: number;
  km: number;
  seconds: number;
  cost: number | null;
}

/** Arrivi in ogni luogo salvato, dal piu' visitato. */
export function placeStats(trips: TripSummary[], places: Place[], price: number | null): PlaceStat[] {
  return places
    .map((place) => {
      const arriving = closedTrips(trips).filter((t) => t.end_place_id === place.id);
      const tt = totals(arriving, price);
      return { place, visits: arriving.length, km: tt.km, seconds: tt.seconds, cost: tt.cost };
    })
    .sort((a, b) => b.visits - a.visits);
}

export interface Leg {
  from: Place;
  to: Place;
  count: number;
  avgSeconds: number;
  minSeconds: number;
  maxSeconds: number;
  avgKm: number;
  lPer100: number | null;
  avgCost: number | null;
  /** Orario di partenza tipico (mediana), "08:30". */
  typicalStart: string;
}

/**
 * Il tragitto fatto piu' spesso fra due luoghi salvati, nei due versi.
 * "Andata" e' il verso che di solito parte prima nella giornata.
 */
export function recurringRoute(
  trips: TripSummary[], places: Place[], price: number | null
): { out: Leg; back: Leg | null } | null {
  const byId = new Map(places.map((p) => [p.id, p]));
  const pairs = new Map<string, TripSummary[]>();
  for (const t of closedTrips(trips)) {
    if (!t.start_place_id || !t.end_place_id || t.start_place_id === t.end_place_id) continue;
    const key = [t.start_place_id, t.end_place_id].sort().join("|");
    pairs.set(key, [...(pairs.get(key) ?? []), t]);
  }
  let best: TripSummary[] | null = null;
  for (const list of pairs.values()) if (!best || list.length > best.length) best = list;
  if (!best || best.length < 3) return null;

  const legs = new Map<string, TripSummary[]>();
  for (const t of best) {
    const key = `${t.start_place_id}>${t.end_place_id}`;
    legs.set(key, [...(legs.get(key) ?? []), t]);
  }
  const built = [...legs.values()].map((list) => leg(list, byId, price));
  built.sort((a, b) => a.typicalStart.localeCompare(b.typicalStart));
  return { out: built[0], back: built[1] ?? null };
}

function leg(list: TripSummary[], byId: Map<string, Place>, price: number | null): Leg {
  const secs = list.map((t) => t.duration_s ?? 0);
  const tt = totals(list, price);
  const minutesOfDay = list
    .map((t) => {
      const d = new Date(t.started_at);
      return d.getHours() * 60 + d.getMinutes();
    })
    .sort((a, b) => a - b);
  const median = minutesOfDay[Math.floor(minutesOfDay.length / 2)];
  return {
    from: byId.get(list[0].start_place_id as string) as Place,
    to: byId.get(list[0].end_place_id as string) as Place,
    count: list.length,
    avgSeconds: secs.reduce((a, b) => a + b, 0) / list.length,
    minSeconds: Math.min(...secs),
    maxSeconds: Math.max(...secs),
    avgKm: tt.km / list.length,
    lPer100: tt.lPer100,
    avgCost: tt.cost != null ? tt.cost / list.length : null,
    typicalStart: `${String(Math.floor(median / 60)).padStart(2, "0")}:${String(median % 60).padStart(2, "0")}`,
  };
}

// -- record -----------------------------------------------------------------

export interface RecordItem {
  key: string;
  label: string;
  value: string;
  unit: string;
  what: string;
  when: string;
  /** Stabilito nel mese in corso. */
  isNew: boolean;
  tone: "neutral" | "good" | "warn";
  tripId?: string;
}

interface RecordInput {
  trips: TripSummary[];
  refuels: Refuel[];
  places: Place[];
  price: number | null;
  describe: (t: TripSummary) => string;
  now?: Date;
}

/** I record di sempre, nell'ordine in cui si mostrano. */
export function records({ trips, refuels, places, price, describe, now = new Date() }: RecordInput): RecordItem[] {
  const closed = closedTrips(trips).filter((t) => kmOf(t) > 0);
  if (closed.length === 0) return [];
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const isNew = (d: Date) => d >= monthStart;
  const dateLabel = (d: Date) => d.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
  const n = (v: number, d = 1) => v.toLocaleString("it-IT", { minimumFractionDigits: d, maximumFractionDigits: d });
  const out: RecordItem[] = [];

  // Per giorno: km e numero di viaggi.
  const days = new Map<string, { date: Date; km: number; count: number; trips: TripSummary[] }>();
  for (const t of closed) {
    const d = new Date(t.started_at);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const day = days.get(key) ?? { date: d, km: 0, count: 0, trips: [] };
    day.km += kmOf(t);
    day.count += 1;
    day.trips.push(t);
    days.set(key, day);
  }
  const dayList = [...days.values()];
  const busiest = dayList.reduce((a, b) => (b.km > a.km ? b : a));
  out.push({
    key: "day", label: "GIORNO PIÙ INTENSO", value: n(busiest.km, busiest.km < 100 ? 1 : 0), unit: "km",
    what: `${busiest.count} ${busiest.count === 1 ? "viaggio" : "viaggi"}`, when: capital(dateLabel(busiest.date)),
    isNew: isNew(busiest.date), tone: "neutral",
  });

  const longest = closed.reduce((a, b) => (kmOf(b) > kmOf(a) ? b : a));
  out.push({
    key: "longest", label: "VIAGGIO PIÙ LUNGO", value: n(kmOf(longest)), unit: "km",
    what: describe(longest), when: capital(dateLabel(new Date(longest.started_at))),
    isNew: isNew(new Date(longest.started_at)), tone: "neutral", tripId: longest.id,
  });

  // Consumo: sotto i 3 km un viaggio a motore freddo non e' un "record" di
  // efficienza, e' rumore; il peggiore invece si cerca proprio li'.
  const withCons = closed.filter((t) => t.l_per_100km != null && t.l_per_100km > 0);
  const efficient = withCons.filter((t) => kmOf(t) >= 3);
  if (efficient.length > 0) {
    const best = efficient.reduce((a, b) => ((b.l_per_100km as number) < (a.l_per_100km as number) ? b : a));
    out.push({
      key: "best", label: "MIGLIOR CONSUMO", value: n(best.l_per_100km as number), unit: "L/100",
      what: describe(best), when: capital(dateLabel(new Date(best.started_at))),
      isNew: isNew(new Date(best.started_at)), tone: "good", tripId: best.id,
    });
  }
  const thirsty = withCons.filter((t) => kmOf(t) >= 1);
  if (thirsty.length > 0) {
    const worst = thirsty.reduce((a, b) => ((b.l_per_100km as number) > (a.l_per_100km as number) ? b : a));
    out.push({
      key: "worst", label: "PEGGIOR CONSUMO", value: n(worst.l_per_100km as number), unit: "L/100",
      what: `${n(kmOf(worst))} km · ${describe(worst)}`, when: capital(dateLabel(new Date(worst.started_at))),
      isNew: isNew(new Date(worst.started_at)), tone: "warn", tripId: worst.id,
    });
  }

  const months = new Map<string, { date: Date; km: number; count: number }>();
  for (const t of closed) {
    const d = new Date(t.started_at);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    const m = months.get(key) ?? { date: new Date(d.getFullYear(), d.getMonth(), 1), km: 0, count: 0 };
    m.km += kmOf(t);
    m.count += 1;
    months.set(key, m);
  }
  if (months.size > 1) {
    const top = [...months.values()].reduce((a, b) => (b.km > a.km ? b : a));
    out.push({
      key: "month", label: "MESE CON PIÙ KM", value: n(top.km, 0), unit: "km",
      what: `${capital(top.date.toLocaleDateString("it-IT", { month: "long", year: "numeric" }))} · ${top.count} viaggi`,
      when: "", isNew: isNew(top.date), tone: "neutral",
    });
  }

  const paid = refuels.filter((r) => r.status === "confirmed" && r.cost_eur != null);
  if (paid.length > 0) {
    const dearest = paid.reduce((a, b) => ((b.cost_eur as number) > (a.cost_eur as number) ? b : a));
    out.push({
      key: "refuel", label: "PIENO PIÙ CARO", value: n(dearest.cost_eur as number, 2), unit: "€",
      what: dearest.liters != null ? `${n(dearest.liters)} L` : "Rifornimento",
      when: capital(dateLabel(new Date(dearest.detected_at))), isNew: isNew(new Date(dearest.detected_at)), tone: "neutral",
    });
  }

  const visited = placeStats(closed, places, price)[0];
  if (visited && visited.visits > 1) {
    out.push({
      key: "place", label: "META PIÙ VISITATA", value: String(visited.visits), unit: "volte",
      what: `${visited.place.name} · ${n(visited.km, 0)} km`, when: "", isNew: false, tone: "neutral",
    });
  }

  const most = dayList.reduce((a, b) => (b.count > a.count ? b : a));
  if (most.count > 1) {
    out.push({
      key: "count", label: "PIÙ VIAGGI IN UN GIORNO", value: String(most.count), unit: "viaggi",
      what: `${n(most.km)} km in tutto`, when: capital(dateLabel(most.date)), isNew: isNew(most.date), tone: "neutral",
    });
  }
  return out;
}

const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// -- rifornimenti -------------------------------------------------------------

export interface RefuelRow {
  refuel: Refuel;
  liters: number | null;
  total: number | null;
  pricePerLiter: number | null;
  /** Km dal rifornimento precedente. */
  kmSince: number | null;
  /** Consumo reale fra due pieni: litri di questo / km dal pieno precedente. */
  lPer100: number | null;
}

/** Rifornimenti dal piu' recente, con km e consumo reale fra un pieno e l'altro. */
export function refuelRows(refuels: Refuel[], price: number | null): RefuelRow[] {
  const sorted = [...refuels].sort((a, b) => a.detected_at.localeCompare(b.detected_at));
  const rows = sorted.map((r, i) => {
    const liters = r.liters ?? r.liters_estimated;
    const prev = sorted[i - 1];
    const kmSince = prev && r.odometer_km != null && prev.odometer_km != null ? r.odometer_km - prev.odometer_km : null;
    const lPer100 =
      r.full_tank && prev?.full_tank && r.liters != null && kmSince && kmSince > 0 ? (r.liters / kmSince) * 100 : null;
    const unit = r.price_per_liter ?? price;
    const total = r.cost_eur ?? (liters != null && unit != null ? liters * unit : null);
    return { refuel: r, liters, total, pricePerLiter: unit, kmSince, lPer100 };
  });
  return rows.reverse();
}
