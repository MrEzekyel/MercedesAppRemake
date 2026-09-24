/** Numeri e date del resoconto viaggi, all'italiana e sempre allo stesso modo. */

const DAYS = ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"];

/** 1234.5 -> "1.234,5". */
export function num(value: number | null | undefined, decimals = 1): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString("it-IT", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/** Km con un decimale sotto i 100, interi sopra: "8,0", "545", "1.112". */
export function km(value: number | null | undefined): string {
  if (value == null) return "—";
  return num(value, value < 100 ? 1 : 0);
}

export function eur(value: number | null | undefined, decimals = 2): string {
  return value == null ? "—" : `${num(value, decimals)} €`;
}

/** Durata: "17 min", "1h 58m", "18h 10m". */
export function duration(seconds: number | null | undefined): string {
  if (seconds == null) return "—";
  const min = Math.round(seconds / 60);
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, "0")}m`;
}

/** Variazione relativa: 0.094 -> "+9,4%". */
export function pct(delta: number | null | undefined): string {
  if (delta == null || !Number.isFinite(delta)) return "—";
  const sign = delta > 0 ? "+" : delta < 0 ? "−" : "";
  return `${sign}${num(Math.abs(delta) * 100, 1)}%`;
}

export function time(iso: string | Date): string {
  return new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}

export function weekday(d: Date): string {
  return DAYS[d.getDay()];
}

/** "IERI · MERCOLEDÌ 23", "OGGI", "LUNEDÌ 21 SETTEMBRE". */
export function dayHeader(d: Date, now = new Date()): string {
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const diff = Math.round((today - day) / 86400000);
  const name = `${weekday(d)} ${d.getDate()}`;
  if (diff === 0) return `OGGI · ${name}`.toUpperCase();
  if (diff === 1) return `IERI · ${name}`.toUpperCase();
  const month = d.toLocaleDateString("it-IT", { month: "long" });
  return `${name} ${month}`.toUpperCase();
}

/** "23 settembre", con l'anno solo se non e' quello in corso. */
export function shortDate(iso: string | Date, now = new Date()): string {
  const d = new Date(iso);
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "long" };
  if (d.getFullYear() !== now.getFullYear()) opts.year = "numeric";
  return d.toLocaleDateString("it-IT", opts);
}
