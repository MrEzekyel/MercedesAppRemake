# MB Companion

App companion non ufficiale per veicoli Mercedes-Benz: controlli remoti, stato
veicolo in tempo reale e registro viaggi con percorso, distanza e consumi —
cosa che l'app ufficiale Mercedes Me non offre.

Progetto personale, per uso sul proprio veicolo e account Mercedes.

## Architettura

```
┌─────────────────┐      websocket/protobuf      ┌──────────────────┐
│  Backend Python  │ ───────────────────────────► │  Mercedes Me API │
│  (VPS, sempre    │                                │  (non ufficiale) │
│   acceso)        │
└────────┬─────────┘
         │ REST/JSON
         ▼
┌──────────────────┐
│  App Expo/React   │
│  Native (iOS)      │
└──────────────────┘
```

Il backend è l'unico componente che parla con Mercedes: tiene aperto il
websocket, decodifica gli eventi protobuf, rileva l'inizio/fine dei viaggi
dallo stato di accensione, campiona la posizione GPS durante la marcia e
scrive tutto su Postgres/PostGIS. L'app mobile parla solo con il backend, mai
direttamente con Mercedes — le credenziali dell'account Mercedes restano sul
server.

## Perché serve un backend sempre acceso

L'API Mercedes Me non espone uno storico viaggi: i contatori di bordo
(`distanceStart`, `liquidconsumptionstart`, `averageSpeedStart`) sono valori
istantanei che si azzerano a ogni reset, non una cronologia. Il registro
viaggi con percorso e consumi va quindi ricostruito osservando lo stream di
eventi in tempo reale — cosa che richiede un processo persistente, non
un'app che chiama l'API solo quando è aperta.

## Componenti

- **`db/`** — schema Postgres/PostGIS. Vedi `db/schema.sql`.
- **`backend/`** — servizio Python: client websocket Mercedes, rilevamento
  viaggi, API REST per l'app, invio comandi (lock/unlock, finestrini,
  clima, ecc.).
- **`app-mobile/`** — app Expo/React Native.

## Crediti

Il layer di comunicazione con l'API Mercedes (protocollo protobuf via
websocket, OAuth) riusa il lavoro di reverse engineering del progetto
[mbapi2020](https://github.com/ReneNulschDE/mbapi2020) (MIT License).
