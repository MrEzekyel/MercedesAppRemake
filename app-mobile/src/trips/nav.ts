import { router } from "expo-router";

/**
 * Indietro, oppure alla tab Viaggi se non c'e' una pagina a cui tornare
 * (pagina aperta da un link o da una notifica): senza, "indietro" non fa
 * nulla e la schermata resta bloccata.
 */
export function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace("/trips");
}
