/**
 * Task in background del keyless. Vanno definiti al caricamento del bundle,
 * prima del router: quando iOS sveglia l'app per un evento di posizione la
 * avvia senza interfaccia, e il task deve gia' esistere (vedi index.js).
 *
 * Come per le notifiche, una build senza il modulo nativo del task manager
 * non deve caricare la libreria: il keyless risulta semplicemente assente.
 */
import { requireOptionalNativeModule } from "expo-modules-core";

export const keylessAvailable = requireOptionalNativeModule("ExpoTaskManager") != null;

if (keylessAvailable) {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const TaskManager: typeof import("expo-task-manager") = require("expo-task-manager");
  const Location: typeof import("expo-location") = require("expo-location");
  const { FENCE_TASK, TRACK_TASK, handleWake }: typeof import("./engine") = require("./engine");
  /* eslint-enable @typescript-eslint/no-require-imports */

  TaskManager.defineTask<{ eventType: number }>(FENCE_TASK, async ({ data, error }) => {
    if (error || !data) return;
    await handleWake({ kind: data.eventType === Location.GeofencingEventType.Enter ? "enter" : "exit" });
  });

  TaskManager.defineTask<{ locations: import("expo-location").LocationObject[] }>(
    TRACK_TASK,
    async ({ data, error }) => {
      const location = data?.locations?.at(-1);
      if (error || !location) return;
      await handleWake({ kind: "location", location });
    }
  );
}
