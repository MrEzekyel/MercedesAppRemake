/**
 * Permesso per le notifiche locali. Le manda il controllo chiudi/apri del
 * widget (LockControl.swift) con l'esito del comando: il permesso e' uno
 * solo per app ed estensione, ma solo l'app puo' mostrare la richiesta.
 *
 * Niente push remote: con l'Apple ID gratuito non si possono usare.
 *
 * require protetto: una build installata prima di expo-notifications non
 * ha il modulo nativo, e un aggiornamento EAS che lo importasse la farebbe
 * chiudere all'avvio.
 */
export function setUpNotifications(): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Notifications: typeof import("expo-notifications") = require("expo-notifications");
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
  } catch {
    // Build senza il modulo nativo: niente notifiche, l'app funziona lo stesso.
  }
}
