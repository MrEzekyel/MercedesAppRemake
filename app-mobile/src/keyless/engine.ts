/**
 * Keyless "via cloud": la Classe A non sa dov'e' il telefono, quindi e' il
 * telefono a decidere quando mandarle i comandi, dalla sua posizione.
 *
 * - Ti allontani (oltre AWAY_M) dall'auto parcheggiata e aperta: la chiude,
 *   poi chiude i finestrini se aperti, e avvisa. Una volta per uscita.
 * - Torni nella zona dell'auto chiusa: notifica "Apri" (Face ID). Mai
 *   un'apertura automatica: col telefono in casa e l'auto sotto casa si
 *   aprirebbe da sola.
 *
 * Chi sveglia l'app (tasks.ts):
 * - la zona di FENCE_M attorno all'auto parcheggiata, che iOS controlla
 *   anche ad app chiusa, all'uscita e al rientro;
 * - il GPS continuo, acceso solo quando serve: in viaggio ("drive"), per
 *   accorgersi del parcheggio, e per pochi minuti dopo ("walkaway"), per
 *   chiudere gia' a qualche decina di metri invece che quando iOS segnala
 *   l'uscita dalla zona.
 *
 * Ogni risveglio rilegge lo stato dell'auto dal backend e decide da li'.
 */
import * as Location from "expo-location";
import { api, ApiError, runCommand } from "../api";
import { distanceM } from "../geo";
import { notify } from "../notifications";
import type { VehicleState } from "../types";
import { loadState, saveState, type KeylessState, type TrackingMode } from "./store";

export const FENCE_TASK = "keyless-fence";
export const TRACK_TASK = "keyless-track";

/** Raggio della zona che iOS sorveglia ad app chiusa. */
const FENCE_M = 100;
/** Oltre questa distanza dall'auto sei "lontano". */
const AWAY_M = 70;
/** GPS preciso dopo il parcheggio: abbastanza per allontanarsi a piedi. */
const WALKAWAY_MS = 15 * 60 * 1000;
/** Sopra i 15 km/h il telefono e' in macchina, non a piedi. */
const DRIVING_MPS = 4;
const APPROACH_COOLDOWN_MS = 10 * 60 * 1000;
/** Il GPS manda una posizione ogni pochi metri: il backend basta rileggerlo ogni tanto. */
const MIN_CHECK_MS = 15 * 1000;

export type Wake =
  | { kind: "enter" }
  | { kind: "exit" }
  | { kind: "location"; location: Location.LocationObject }
  | { kind: "app" };

/** Un risveglio alla volta: i task possono arrivare a raffica. */
let queue: Promise<void> = Promise.resolve();

export function handleWake(wake: Wake): Promise<void> {
  queue = queue.then(() => step(wake)).catch(() => {});
  return queue;
}

async function step(wake: Wake): Promise<void> {
  const state = loadState();
  if (!state.enabled) return;
  if (wake.kind === "location" && Date.now() - state.lastCheckAt < MIN_CHECK_MS) return;
  state.lastCheckAt = Date.now();

  const car = (await api.getState())[0];
  if (!car) return;
  const phone = wake.kind === "location" ? wake.location : await phoneLocation();

  const parked = car.ignition_state === "0" || car.ignition_state === "1";
  if (!parked || car.latitude == null || car.longitude == null) {
    // In viaggio: niente zona, GPS a maglie larghe per accorgersi di quando
    // si parcheggia.
    state.parkingId = null;
    state.wasAway = false;
    state.autoLockDone = false;
    await setTracking(state, "drive");
    saveState(state);
    return;
  }

  const spot = { latitude: car.latitude, longitude: car.longitude };
  const parkingId = `${spot.latitude.toFixed(4)},${spot.longitude.toFixed(4)}`;
  const newSpot = parkingId !== state.parkingId;
  if (newSpot) {
    state.parkingId = parkingId;
    state.wasAway = false;
    state.autoLockDone = false;
    state.walkawayUntil = Date.now() + WALKAWAY_MS;
  }
  // Anche a sosta invariata: dopo un riavvio o una disattivazione iOS
  // potrebbe non sorvegliare piu' la zona.
  if (newSpot || !(await Location.hasStartedGeofencingAsync(FENCE_TASK))) {
    await Location.startGeofencingAsync(FENCE_TASK, [
      { identifier: "car", ...spot, radius: FENCE_M, notifyOnEnter: true, notifyOnExit: true },
    ]);
  }

  const distance = phone ? distanceM(spot, phone.coords.latitude, phone.coords.longitude) : null;
  const driving = (phone?.coords.speed ?? 0) > DRIVING_MPS;

  if (wake.kind === "enter" || (distance != null && distance < FENCE_M / 2)) {
    if (wake.kind === "enter" && state.wasAway && car.doors_locked && !driving) {
      await announceApproach(state);
    }
    state.wasAway = false;
    state.autoLockDone = false;
  } else if (wake.kind === "exit" || (distance != null && distance > AWAY_M)) {
    state.wasAway = true;
  }

  if (state.wasAway && car.doors_locked === false && !state.autoLockDone && !driving) {
    // Segnato prima di mandare il comando: un secondo risveglio a meta'
    // non deve mandarne un altro.
    state.autoLockDone = true;
    saveState(state);
    await autoLock(car);
  }

  // Il GPS preciso serve solo finche' c'e' un'auto aperta da chiudere e da
  // poco parcheggiata; dopo basta la zona.
  const needsWalkaway = car.doors_locked === false && !state.autoLockDone && Date.now() < state.walkawayUntil;
  await setTracking(state, needsWalkaway ? "walkaway" : null);
  saveState(state);
}

async function phoneLocation(): Promise<Location.LocationObject | null> {
  try {
    return (
      (await Location.getLastKnownPositionAsync({ maxAge: 60 * 1000, requiredAccuracy: 100 })) ??
      (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }))
    );
  } catch {
    return null;
  }
}

async function setTracking(state: KeylessState, mode: TrackingMode | null): Promise<void> {
  const running = await Location.hasStartedLocationUpdatesAsync(TRACK_TASK).catch(() => false);
  if (mode === state.tracking && running === (mode !== null)) return;
  if (running) await Location.stopLocationUpdatesAsync(TRACK_TASK).catch(() => {});
  state.tracking = mode;
  if (!mode) return;
  await Location.startLocationUpdatesAsync(TRACK_TASK, {
    // In viaggio basta capire quando ci si ferma; a piedi servono pochi metri.
    accuracy: mode === "drive" ? Location.Accuracy.Balanced : Location.Accuracy.High,
    distanceInterval: mode === "drive" ? 150 : 15,
    activityType: mode === "drive" ? Location.ActivityType.AutomotiveNavigation : Location.ActivityType.Fitness,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: false,
  });
}

async function autoLock(car: VehicleState): Promise<void> {
  try {
    const locked = await runCommand(car.vin, api.lock);
    const windowsOpen = car.openings?.windows_overall !== undefined && car.openings.windows_overall !== "closed";
    if (windowsOpen && locked === "confirmed") {
      await runCommand(car.vin, api.windowsClose).catch(() => null);
    }
    await notify(
      "keyless",
      locked === "confirmed" ? "Classe A chiusa" : "Chiusura inviata",
      (locked === "confirmed"
        ? "Ti sei allontanato con l'auto aperta: l'ho chiusa io."
        : "Ti sei allontanato con l'auto aperta: l'auto non ha ancora confermato la chiusura.") +
        (windowsOpen ? " Finestrini in chiusura." : "")
    );
  } catch (e) {
    await notify(
      "keyless",
      "Classe A rimasta aperta",
      `Chiusura automatica non riuscita: ${e instanceof ApiError ? e.message : "backend non raggiungibile"}.`,
      "keyless-lock"
    );
  }
}

async function announceApproach(state: KeylessState): Promise<void> {
  if (Date.now() - state.lastApproachAt < APPROACH_COOLDOWN_MS) return;
  state.lastApproachAt = Date.now();
  await notify("keyless", "Sei vicino alla Classe A", "Tieni premuto per aprirla.", "keyless-unlock");
}

/** Spegne tutto: zona, GPS e stato della sosta. */
export async function stopKeyless(): Promise<void> {
  const state = loadState();
  state.enabled = false;
  state.parkingId = null;
  await Location.stopGeofencingAsync(FENCE_TASK).catch(() => {});
  await setTracking(state, null).catch(() => {});
  saveState(state);
}
