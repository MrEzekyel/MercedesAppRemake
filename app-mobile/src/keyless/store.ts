/**
 * Stato del keyless salvato su file: iOS sveglia l'app in background per
 * pochi secondi e ogni volta riparte da zero, quindi quello che serve fra un
 * risveglio e l'altro sta qui, non in memoria.
 */
import { File, Paths } from "expo-file-system";

export type TrackingMode = "drive" | "walkaway";

export interface KeylessState {
  enabled: boolean;
  /** Sosta in corso: la posizione dell'auto al parcheggio, arrotondata. */
  parkingId: string | null;
  /** Quando il GPS continuo per l'allontanamento si spegne da solo. */
  walkawayUntil: number;
  /** Uscito dalla zona dell'auto dopo il parcheggio: al rientro scatta l'avviso. */
  wasAway: boolean;
  /** Chiusura automatica gia' tentata per questa uscita: una sola per volta. */
  autoLockDone: boolean;
  lastApproachAt: number;
  lastCheckAt: number;
  tracking: TrackingMode | null;
}

const DEFAULTS: KeylessState = {
  enabled: false,
  parkingId: null,
  walkawayUntil: 0,
  wasAway: false,
  autoLockDone: false,
  lastApproachAt: 0,
  lastCheckAt: 0,
  tracking: null,
};

const file = () => new File(Paths.document, "keyless.json");

export function loadState(): KeylessState {
  try {
    const f = file();
    if (!f.exists) return { ...DEFAULTS };
    return { ...DEFAULTS, ...JSON.parse(f.textSync()) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveState(state: KeylessState): void {
  try {
    file().write(JSON.stringify(state));
  } catch {
    // Al prossimo risveglio si riparte dai valori salvati prima.
  }
}
