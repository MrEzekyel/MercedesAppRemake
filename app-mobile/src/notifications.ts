/**
 * Notifiche locali: l'esito del controllo chiudi/apri del widget (le manda
 * LockControl.swift) e quelle del keyless. Niente push remote: con l'Apple
 * ID gratuito non si possono usare. Il permesso e' uno solo per app ed
 * estensione, ma solo l'app puo' mostrare la richiesta.
 *
 * Una build installata prima di expo-notifications non ha il modulo nativo,
 * e un aggiornamento EAS che caricasse la libreria la farebbe chiudere: un
 * try/catch attorno al require non basta, perche' Metro segnala come fatale
 * l'errore di un modulo caricato fuori dall'avvio. Si controlla prima che
 * il modulo nativo ci sia.
 */
import { requireOptionalNativeModule } from "expo-modules-core";
import { api, ApiError, runCommand } from "./api";

type NotificationsModule = typeof import("expo-notifications");

function load(): NotificationsModule | null {
  if (!requireOptionalNativeModule("ExpoPushTokenManager")) return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("expo-notifications");
}

/** Categorie con pulsante: si aprono tenendo premuta la notifica. */
const ACTIONS: Record<string, { action: "unlock" | "lock"; title: string }> = {
  "keyless-unlock": { action: "unlock", title: "Apri" },
  "keyless-lock": { action: "lock", title: "Chiudi" },
};

/**
 * Stesso identificativo = la nuova sostituisce la precedente invece di
 * accumularsi.
 */
export async function notify(id: string, title: string, body: string, category?: string): Promise<void> {
  const Notifications = load();
  if (!Notifications) return;
  await Notifications.scheduleNotificationAsync({
    identifier: id,
    content: { title, body, sound: true, categoryIdentifier: category },
    trigger: null,
  }).catch(() => {});
}

export function setUpNotifications(): () => void {
  const Notifications = load();
  if (!Notifications) return () => {};

  // Con l'app aperta (Centro di Controllo tirato giu' sopra l'app) iOS
  // passa la notifica all'app invece di mostrarla: senza questo si perde.
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
  Notifications.getPermissionsAsync()
    .then((current) => {
      if (current.status === "undetermined") return Notifications.requestPermissionsAsync();
    })
    .catch(() => {});

  // Aprire l'auto chiede il telefono sbloccato (Face ID) e apre l'app:
  // da una notifica sulla schermata di blocco non deve bastare un tocco.
  for (const [category, { action, title }] of Object.entries(ACTIONS)) {
    Notifications.setNotificationCategoryAsync(category, [
      {
        identifier: action,
        buttonTitle: title,
        options: { opensAppToForeground: true, isAuthenticationRequired: true },
      },
    ]).catch(() => {});
  }

  const handled = new Set<string>();
  const onResponse = (response: import("expo-notifications").NotificationResponse) => {
    const key = `${response.notification.request.identifier}:${response.notification.date}`;
    if (handled.has(key)) return;
    handled.add(key);
    Notifications.clearLastNotificationResponse();
    if (response.actionIdentifier === "unlock" || response.actionIdentifier === "lock") {
      carCommand(response.actionIdentifier);
    }
  };
  // L'app puo' essere stata avviata proprio dal pulsante: la risposta
  // arriva prima che ci sia un listener.
  const last = Notifications.getLastNotificationResponse();
  if (last) onResponse(last);
  const subscription = Notifications.addNotificationResponseReceivedListener(onResponse);
  return () => subscription.remove();
}

async function carCommand(action: "unlock" | "lock"): Promise<void> {
  const verb = action === "unlock" ? "Apertura" : "Chiusura";
  try {
    const car = (await api.getState())[0];
    if (!car) throw new ApiError(0, "nessuna auto");
    const result = await runCommand(car.vin, action === "unlock" ? api.unlock : api.lock);
    await notify(
      "keyless",
      result === "confirmed" ? (action === "unlock" ? "Classe A aperta" : "Classe A chiusa") : `${verb} inviata`,
      result === "confirmed"
        ? `L'auto ha confermato ${action === "unlock" ? "l'apertura" : "la chiusura"}.`
        : "L'auto non ha ancora confermato: controlla tra poco."
    );
  } catch (e) {
    await notify("keyless", `${verb} non riuscita`, e instanceof ApiError ? e.message : "Backend non raggiungibile");
  }
}
