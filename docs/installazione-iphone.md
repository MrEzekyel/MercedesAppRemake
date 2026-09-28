# Installare MB Companion sull'iPhone (Apple ID gratuito)

L'app si compila nel cloud di Expo **senza firma**. La firma la mette Sideloadly
al momento dell'installazione, con il tuo Apple ID gratuito. Con un account
gratuito Apple fa scadere la firma dopo **7 giorni**: dopo va reinstallata (i
dati restano).

## Prima installazione

1. Scarica Sideloadly per macOS da <https://sideloadly.io> e installalo.
2. Collega l'iPhone al Mac con il cavo. Sbloccalo e rispondi "Autorizza" alla
   domanda "Vuoi autorizzare questo computer?".
3. Apri Sideloadly e trascina `MBCompanion.ipa` nel riquadro dell'app.
4. In "Apple Account" scrivi la mail del tuo Apple ID e premi **Start**. Ti
   chiede la password dell'Apple ID ed eventualmente il codice di verifica a
   due fattori. Sideloadly la usa solo per chiedere ad Apple il certificato
   gratuito.
5. Sull'iPhone:
   - vai in **Impostazioni › Privacy e sicurezza › Modalità sviluppatore**,
     attivala e riavvia il telefono quando lo chiede;
   - vai in **Impostazioni › Generali › VPN e gestione dispositivi**, tocca il
     tuo Apple ID e poi **Autorizza**.
6. Apri MB Companion una volta.

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

Il widget si aggiorna da solo circa ogni 15 minuti, a discrezione di iOS. L'ora
in basso è quella dell'ultimo dato ricevuto dall'auto.

## Ogni 7 giorni

Collega l'iPhone e trascina di nuovo lo stesso `MBCompanion.ipa` in
Sideloadly, poi premi **Start**. L'app viene aggiornata senza perdere i dati.

Sideloadly ha anche un'opzione di rinnovo automatico via Wi-Fi. Richiede che il
Mac sia acceso e sulla stessa rete dell'iPhone.

## Aggiornamenti

- **Modifiche solo all'app (JavaScript)** arrivano da sole con EAS Update, sul
  canale `production`:

  ```sh
  cd app-mobile && npx eas-cli update --branch production --platform ios
  ```

- **Modifiche native** (widget, nuove librerie native) richiedono una nuova
  build e una reinstallazione con Sideloadly:

  ```sh
  cd app-mobile && EAS_NO_VCS=1 npx eas-cli build --platform ios --profile unsigned
  ```

  `EAS_NO_VCS=1` serve perché `src/config.ts` (indirizzo e token del backend) è
  fuori da git ma deve arrivare nella build. Le regole di cosa caricare sono in
  `.easignore` nella radice del repository.
