/**
 * Periodi del resoconto viaggi: giorno, settimana, mese, 3 mesi, anno, da sempre.
 *
 * Un periodo in corso si confronta con lo stesso tratto del precedente
 * (1–24 settembre contro 1–24 agosto), non con il precedente intero:
 * altrimenti a inizio mese ogni numero sembrerebbe crollato.
 */

export type PeriodKind = "day" | "week" | "month" | "quarter" | "year" | "all";

export interface Period {
  kind: PeriodKind;
  /** 0 = quello in corso, -1 il precedente, ... */
  offset: number;
  start: Date;
  /** Escluso. Per il periodo in corso e' adesso, non la fine del periodo. */
  end: Date;
  /** Fine teorica del periodo (esclusa): serve al grafico per i giorni futuri. */
  fullEnd: Date;
  /** "Settembre 2026", "22–28 set", "2026", "Da sempre". */
  label: string;
  /** Riga sotto il selettore: "SETTEMBRE 2026 · 1–24". */
  caption: string;
  /** "agosto", "la settimana scorsa", "il 2025": per le frasi di confronto. */
  previousName: string | null;
}

export interface Bucket {
  start: Date;
  end: Date;
  label: string;
  /** Nel futuro rispetto ad adesso: il grafico lo disegna vuoto. */
  future: boolean;
}

const MONTHS = [
  "gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno",
  "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre",
];
const MONTHS_SHORT = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
const DAYS_SHORT = ["L", "M", "M", "G", "V", "S", "D"];
const DAYS = ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"];

export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

/** Lunedi' della settimana che contiene d. */
function startOfWeek(d: Date): Date {
  const day = (d.getDay() + 6) % 7;
  return addDays(startOfDay(d), -day);
}

export function periodFor(kind: PeriodKind, offset: number, now = new Date(), firstTripAt?: Date): Period {
  const today = startOfDay(now);
  let start: Date;
  let fullEnd: Date;
  let label: string;
  let previousName: string | null;

  switch (kind) {
    case "day": {
      start = addDays(today, offset);
      fullEnd = addDays(start, 1);
      const long = `${DAYS[start.getDay()]} ${start.getDate()} ${MONTHS[start.getMonth()]}`;
      label = offset === 0 ? "Oggi" : offset === -1 ? "Ieri" : capitalize(long);
      previousName = offset === 0 ? "ieri" : "il giorno prima";
      break;
    }
    case "week": {
      start = addDays(startOfWeek(today), 7 * offset);
      fullEnd = addDays(start, 7);
      const last = addDays(fullEnd, -1);
      label =
        start.getMonth() === last.getMonth()
          ? `${start.getDate()}–${last.getDate()} ${MONTHS_SHORT[last.getMonth()]}`
          : `${start.getDate()} ${MONTHS_SHORT[start.getMonth()]} – ${last.getDate()} ${MONTHS_SHORT[last.getMonth()]}`;
      if (offset === 0) label = "Questa settimana";
      if (offset === -1) label = "Settimana scorsa";
      previousName = offset === 0 ? "la settimana scorsa" : "la settimana prima";
      break;
    }
    case "month": {
      start = new Date(today.getFullYear(), today.getMonth() + offset, 1);
      fullEnd = new Date(start.getFullYear(), start.getMonth() + 1, 1);
      label = `${capitalize(MONTHS[start.getMonth()])} ${start.getFullYear()}`;
      previousName = MONTHS[(start.getMonth() + 11) % 12];
      break;
    }
    case "quarter": {
      // Tre mesi di calendario che finiscono con quello in corso.
      start = new Date(today.getFullYear(), today.getMonth() - 2 + 3 * offset, 1);
      fullEnd = new Date(start.getFullYear(), start.getMonth() + 3, 1);
      const last = new Date(fullEnd.getFullYear(), fullEnd.getMonth() - 1, 1);
      label = `${capitalize(MONTHS_SHORT[start.getMonth()])} – ${MONTHS_SHORT[last.getMonth()]} ${last.getFullYear()}`;
      previousName = "i 3 mesi prima";
      break;
    }
    case "year": {
      start = new Date(today.getFullYear() + offset, 0, 1);
      fullEnd = new Date(start.getFullYear() + 1, 0, 1);
      label = String(start.getFullYear());
      previousName = `il ${start.getFullYear() - 1}`;
      break;
    }
    case "all": {
      start = firstTripAt ? new Date(firstTripAt.getFullYear(), firstTripAt.getMonth(), 1) : new Date(2020, 0, 1);
      fullEnd = new Date(today.getFullYear(), today.getMonth() + 1, 1);
      label = "Da sempre";
      previousName = null;
      break;
    }
  }

  const end = now < fullEnd ? now : fullEnd;
  let caption = label.toUpperCase();
  if (kind === "month" && now < fullEnd) caption += ` · 1–${today.getDate()}`;
  if (kind === "day" && offset >= -1) caption += ` · ${DAYS[start.getDay()]} ${start.getDate()} ${MONTHS[start.getMonth()]}`.toUpperCase();
  if (kind === "all" && firstTripAt) caption = `DA ${MONTHS[firstTripAt.getMonth()].toUpperCase()} ${firstTripAt.getFullYear()}`;
  return { kind, offset, start, end, fullEnd, label, caption, previousName };
}

/**
 * Lo stesso tratto del periodo precedente. Per un periodo concluso e' il
 * precedente intero; per quello in corso, lo stesso numero di giorni.
 */
export function previousRange(p: Period): { start: Date; end: Date } | null {
  if (p.kind === "all") return null;
  const prevStart =
    p.kind === "day"
      ? addDays(p.start, -1)
      : p.kind === "week"
        ? addDays(p.start, -7)
        : p.kind === "month"
          ? new Date(p.start.getFullYear(), p.start.getMonth() - 1, 1)
          : p.kind === "quarter"
            ? new Date(p.start.getFullYear(), p.start.getMonth() - 3, 1)
            : new Date(p.start.getFullYear() - 1, 0, 1);
  const prevFullEnd = p.start;
  if (p.end >= p.fullEnd) return { start: prevStart, end: prevFullEnd };
  const elapsed = p.end.getTime() - p.start.getTime();
  const end = new Date(Math.min(prevStart.getTime() + elapsed, prevFullEnd.getTime()));
  return { start: prevStart, end };
}

/**
 * Colonne del grafico: ore per il giorno, giorni per settimana e mese,
 * settimane per i 3 mesi, mesi per anno e "da sempre".
 */
export function bucketsFor(p: Period, now = new Date()): Bucket[] {
  const out: Bucket[] = [];
  if (p.kind === "day") {
    for (let h = 0; h < 24; h++) {
      const start = new Date(p.start.getFullYear(), p.start.getMonth(), p.start.getDate(), h);
      const end = new Date(p.start.getFullYear(), p.start.getMonth(), p.start.getDate(), h + 1);
      out.push({ start, end, label: String(h), future: start > now });
    }
    return out;
  }
  if (p.kind === "quarter") {
    for (let d = startOfWeek(p.start); d < p.fullEnd; d = addDays(d, 7)) {
      out.push({ start: d, end: addDays(d, 7), label: `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`, future: d > now });
    }
    return out;
  }
  if (p.kind === "week" || p.kind === "month") {
    for (let d = p.start; d < p.fullEnd; d = addDays(d, 1)) {
      const label = p.kind === "week" ? DAYS_SHORT[(d.getDay() + 6) % 7] : String(d.getDate());
      out.push({ start: d, end: addDays(d, 1), label, future: d > now });
    }
    return out;
  }
  for (let d = p.start; d < p.fullEnd; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
    const end = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    out.push({ start: d, end, label: MONTHS_SHORT[d.getMonth()], future: d > now });
  }
  return out;
}

export function monthName(d: Date): string {
  return MONTHS[d.getMonth()];
}

export function monthShort(d: Date): string {
  return MONTHS_SHORT[d.getMonth()];
}

/** Nome di una colonna per il valore toccato nel grafico: "mar 22 set", "14:00–15:00". */
export function bucketName(b: Bucket, kind: PeriodKind): string {
  const d = b.start;
  switch (kind) {
    case "day":
      return `${d.getHours()}:00–${d.getHours() + 1}:00`;
    case "week":
    case "month":
      return `${DAYS[d.getDay()].slice(0, 3)} ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
    case "quarter":
      return `settimana dal ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
    default:
      return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  }
}

/** Poche etichette sotto l'asse X, distribuite su tutta la larghezza. */
export function axisLabelsFor(buckets: Bucket[], kind: PeriodKind): string[] {
  const n = buckets.length;
  const pick = (idx: number[]) => idx.filter((i) => i >= 0 && i < n).map((i) => buckets[i].label);
  switch (kind) {
    case "day":
      return ["0", "6", "12", "18", "24"];
    case "week":
      return buckets.map((b) => b.label);
    case "month":
      return pick([0, 7, 14, 21, n - 1]);
    case "year":
      return n <= 12 ? buckets.map((b) => b.label) : pick([0, Math.floor(n / 2), n - 1]);
    case "all": {
      const withYear = (b: Bucket) => `${b.label} ${String(b.start.getFullYear()).slice(2)}`;
      return n <= 1 ? buckets.map(withYear) : [withYear(buckets[0]), withYear(buckets[n - 1])];
    }
    default:
      return pick([0, Math.floor(n / 2), n - 1]);
  }
}

/** "all'ora", "al giorno", "a settimana", "al mese": per i titoli dei grafici. */
export function perBucket(kind: PeriodKind): string {
  if (kind === "day") return "all'ora";
  if (kind === "week" || kind === "month") return "al giorno";
  if (kind === "quarter") return "a settimana";
  return "al mese";
}
