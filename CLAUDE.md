# Classe A (MB Companion)

App personale per la Mercedes Classe A (W177, 2021) di Andrea: mai pubblica,
installata solo sul suo iPhone. `backend/` (Python) parla con Mercedes tramite
la logica di mbapi2020; `app-mobile/` è Expo SDK 57 + expo-router; i widget
iOS stanno in `app-mobile/targets/widget` (@bacons/apple-targets).

## Dati sensibili

- `app-mobile/src/config.ts` (gitignored) contiene indirizzo e token del
  backend: non stamparlo mai. Per interrogare il backend, leggerlo da script
  senza mostrarlo, con uno User-Agent esplicito (senza, Cloudflare dà 403).
- `backend/data/token.json` è sensibile. Non avviare il backend locale contro
  l'account Mercedes reale e non scrivere dati di prova nel database di
  produzione.

## Installazione sull'iPhone

Apple ID gratuito, firma valida 7 giorni: procedura completa in
`docs/installazione-iphone.md`.

- Build nel cloud senza firma: da `app-mobile`,
  `EAS_NO_VCS=1 npx eas-cli build -p ios --profile unsigned`
  (`EAS_NO_VCS` serve perché `src/config.ts` finisca nella build; cosa si
  carica lo decide `.easignore` nella radice).
- Firma e installazione: `app-mobile/scripts/installa-iphone.sh [ipa]`, con
  Xcode 26.3 in `/Applications/Xcode-26.3.app` via `DEVELOPER_DIR` (non
  cambiare xcode-select). Il Mac è fermo a macOS Sequoia: niente build
  locali, niente downgrade dell'SDK. Sideloadly non funziona su questo Mac.
- Modifiche solo JavaScript:
  `npx eas-cli update --branch production --platform ios --environment production`.

### Trappola degli aggiornamenti EAS

`runtimeVersion` è `sdkVersion`: un aggiornamento arriva anche alle build già
installate che non hanno un modulo nativo appena aggiunto. Il 29/09/2026 un
aggiornamento che caricava expo-notifications faceva chiudere l'app all'avvio
(rimediato con `eas update:roll-back-to-embedded`).

- Un try/catch attorno a `require` non basta: Metro segnala come fatale
  l'errore di un modulo caricato a runtime. Controllare prima con
  `requireOptionalNativeModule("<ModuloNativo>")` (vedi `src/notifications.ts`).
- Prima di pubblicare un aggiornamento con nuove dipendenze native, provarlo
  sulla build vecchia nel simulatore: `npx expo export --platform ios` e
  copiare il `.hbc` nel `main.jsbundle` dell'app installata nel simulatore.

## Widget e controllo chiudi/apri

- Il controllo della schermata di blocco (`LockControl.swift`) gira nel
  processo del widget e manda una notifica locale con l'esito. Il permesso
  delle notifiche lo chiede l'app al primo avvio: senza, iOS le scarta in
  silenzio.
- Il processo del widget resta vivo fra un tocco e l'altro e riusa connessioni
  HTTP/3 che sulla rete cellulare muoiono: `MBApi.send` riprova sugli errori
  -1005/-999.
- Per leggere i log dell'iPhone collegato via USB:
  `pymobiledevice3 syslog live` (installarlo in un venv con
  `--only-binary=cryptography`).
- I finestrini si chiudono da remoto solo con l'auto chiusa a chiave: l'app lo
  controlla prima di mandare il comando.

## Keyless

Il keyless via GPS (zona attorno all'auto) è stato scartato: precisione di
70-200 m, Andrea non lo vuole. Non riproporlo.

Si farà con un **beacon Bluetooth (iBeacon)** a batteria, con potenza
regolabile, lasciato nell'abitacolo. Andrea fornirà l'UUID. Vincoli:

- l'auto non sa dov'è il telefono: i comandi passano da backend e cloud
  Mercedes e impiegano circa 10 s (una chiusura: 11 s alla conferma). Quindi
  l'apertura deve partire quando il beacon ti rileva, a 10-20 m;
- iOS segnala l'uscita dal raggio del beacon circa 30 s dopo aver perso il
  segnale: la chiusura avviene mentre ti allontani;
- expo-location non gestisce i beacon: serve un modulo nativo Swift;
- da riusare la logica del commit `97068cd` (`app-mobile/src/keyless/`,
  annullato in `623ac9a`): risvegli in background, una sola chiusura per
  uscita e poi i finestrini, notifiche con pulsante e Face ID, controllo del
  modulo nativo per le build vecchie;
- proposta ancora da confermare: apertura automatica all'arrivo, solo dopo
  essersi allontanati, eventualmente disattivata nei luoghi salvati come
  "Casa".
