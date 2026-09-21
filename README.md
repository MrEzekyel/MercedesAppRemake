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

## Avvio in locale

Serve Python 3.11+ e un Postgres con PostGIS.

### Il database

Con Docker:

```bash
docker compose up -d                 # schema caricato al primo avvio
```

Senza Docker, su macOS: [Postgres.app](https://postgresapp.com) include gia'
PostGIS. Dopo averlo avviato, crea il database e caricaci lo schema:

```bash
createdb mbcompanion
psql -d mbcompanion -f db/schema.sql
```

In questo caso l'utente e' il tuo account macOS, quindi in `.env` serve:
`DATABASE_URL=postgresql://$(whoami)@localhost:5432/mbcompanion`

### Il backend

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt

cp .env.example .env                 # inserisci qui le tue credenziali Mercedes
.venv/bin/python -m app.main
```

L'API risponde su `http://localhost:8000`; `GET /health` non richiede
autenticazione, il resto vuole l'header `Authorization: Bearer <API_AUTH_TOKEN>`.

Le credenziali stanno solo nel `.env` locale, che non viene mai committato.
Conviene usare un account Mercedes dedicato, con MFA disattivata, e l'auto
condivisa su quell'account.

### Test

I test del rilevamento viaggi girano contro un database vero:

```bash
cd backend
TEST_DATABASE_URL=<stessa URL del .env> .venv/bin/python -m pytest -v
```

I test scrivono e cancellano un veicolo di prova (VIN `TESTVIN...`), quindi
possono girare anche sul database che usi normalmente.

### Aggiornare lo strato di protocollo

```bash
cd backend && ./vendor.sh
```

## Crediti

Il layer di comunicazione con l'API Mercedes (protocollo protobuf via
websocket, OAuth) riusa il lavoro di reverse engineering del progetto
[mbapi2020](https://github.com/ReneNulschDE/mbapi2020) (MIT License).
