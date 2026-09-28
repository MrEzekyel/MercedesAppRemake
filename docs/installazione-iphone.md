# Installare MB Companion sull'iPhone (Apple ID gratuito)

L'app si compila nel cloud di Expo **senza firma** (profilo EAS `unsigned`).
La firma la mette questo Mac con Xcode 26.3 e il tuo Apple ID gratuito. Con un
account gratuito Apple fa scadere la firma dopo **7 giorni**: poi si rilancia
lo script e i dati restano.

Sideloadly è stato scartato: su questo Mac il login fallisce sempre con
"Guru Meditation … Invalid file".

## Cosa serve (già fatto una volta)

- **Xcode 26.3** in `/Applications/Xcode-26.3.app` (versione Universal, perché
  il Mac è Intel), con il componente iOS installato e il tuo Apple ID in
  **Impostazioni › Accounts**. Il team gratuito è `J8S23W7H6M`.
- **Il progetto di supporto** in `~/Library/Application Support/MBCompanion/firma`.
  Ha gli stessi identificativi dell'app e del widget, ma non contiene React
  Native. Serve solo perché Xcode crei i profili di firma gratuiti.
- **Sull'iPhone:**
  - Modalità sviluppatore attiva (**Impostazioni › Privacy e sicurezza**);
  - certificato autorizzato in **Impostazioni › Generali › VPN e gestione
    dispositivi › Apple Development › Autorizza**.

## Ogni 7 giorni

Collega e sblocca l'iPhone, poi dalla cartella del repository:

```sh
app-mobile/scripts/installa-iphone.sh
```

Lo script:
1. rinnova i profili se stanno per scadere;
2. firma app e widget;
3. installa sull'iPhone;
4. stampa la nuova scadenza.

Se non riesce a rinnovare i profili, apri
`~/Library/Application Support/MBCompanion/firma/ios/MBCompanion.xcodeproj` in
Xcode 26.3, premi Play una volta e rilancia lo script.

## Widget e controllo

- **Widget "Stato auto"**: tieni premuto sulla Home, poi **Modifica › Aggiungi
  widget**. Cerca "MB Companion" e aggiungi "Stato auto" (è di taglia media).
- **Chiudi / apri dalla schermata di blocco**: tieni premuto sulla schermata di
  blocco, poi **Personalizza › Schermata di blocco**. Togli la torcia o la
  fotocamera con il "–", tocca il "+" e cerca "Chiudi / apri auto".
- **Centro di Controllo**: aprilo, tocca "+" in alto a sinistra, poi **Aggiungi
  un controllo** e cerca "MB Companion".

Il controllo acceso (lucchetto evidenziato) vuol dire auto chiusa. Toccandolo
manda il comando opposto. Se il telefono è bloccato chiede prima il Face ID,
sia per aprire sia per chiudere: iOS non permette di chiederlo solo per una
delle due azioni.

Il widget si aggiorna da solo circa ogni 15 minuti, a discrezione di iOS.
L'ora in basso è quella dell'ultimo dato ricevuto dall'auto.

## Aggiornamenti

- **Modifiche solo all'app (JavaScript)** arrivano da sole con EAS Update, sul
  canale `production`:

  ```sh
  cd app-mobile && npx eas-cli update --branch production --platform ios
  ```

- **Modifiche native** (widget, nuove librerie native) richiedono una nuova
  build:

  ```sh
  cd app-mobile && EAS_NO_VCS=1 npx eas-cli build --platform ios --profile unsigned
  ```

  Scarica l'IPA dalla pagina della build, poi passala allo script:

  ```sh
  app-mobile/scripts/installa-iphone.sh ~/Downloads/xxxx.ipa
  ```

  Lo script la conserva e dalle volte successive la usa senza argomento.

  `EAS_NO_VCS=1` serve perché `src/config.ts` (indirizzo e token del backend) è
  fuori da git ma deve arrivare nella build. Le regole di cosa caricare sono in
  `.easignore`, nella radice del repository.
