"""Prezzi carburante da MIMIT (Osservaprezzi Carburanti), open data IODL 2.0.

Due CSV pubblici, pipe-delimited, aggiornati ogni giorno lavorativo attorno
alle 7-8 con i prezzi comunicati alle 8 del giorno prima:

    anagrafica_impianti_attivi.csv  idImpianto|Gestore|Bandiera|Tipo Impianto|
                                     Nome Impianto|Indirizzo|Comune|Provincia|
                                     Latitudine|Longitudine
    prezzo_alle_8.csv               idImpianto|descCarburante|prezzo|isSelf|dtComu

Non c'e' un'API: si scaricano i file interi (qualche MB) e si ricostruisce
lo snapshot corrente in DB. Nessuno storico qui: ogni sync sovrascrive i
prezzi del giorno prima con quelli di oggi (vedi Database.replace_fuel_prices).
"""

from __future__ import annotations

import asyncio
import csv
import logging
from dataclasses import dataclass
from datetime import datetime

import aiohttp

from .config import settings
from .db import Database

LOGGER = logging.getLogger(__name__)

# Se un tentativo fallisce (sito irraggiungibile, rete assente) si riprova
# presto invece di aspettare l'intervallo pieno: i prezzi di oggi possono
# ancora non essere pubblicati, o e' stato un problema transitorio.
_RETRY_SECONDS = 15 * 60

_STATIONS_URL = "https://www.mimit.gov.it/images/exportCSV/anagrafica_impianti_attivi.csv"
_PRICES_URL = "https://www.mimit.gov.it/images/exportCSV/prezzo_alle_8.csv"

# Alcuni prezzi nel CSV sono placeholder del gestore (es. 1.000) invece di un
# valore reale, e vanno scartati; il limite superiore e' solo una guardia
# contro righe corrotte (mai visto un carburante sopra i 3 EUR/L in Italia).
_MIN_PLAUSIBLE_PRICE = 1.2
_MAX_PLAUSIBLE_PRICE = 4.0

_DATE_FORMAT = "%d/%m/%Y %H:%M:%S"


@dataclass(frozen=True)
class Station:
    id: int
    brand: str | None
    name: str | None
    address: str | None
    comune: str | None
    provincia: str | None
    lat: float
    lon: float


@dataclass(frozen=True)
class Price:
    station_id: int
    fuel_type: str
    is_self: bool
    price: float
    communicated_at: datetime | None


async def fetch_all() -> tuple[list[Station], list[Price]]:
    """Scarica ed elabora entrambi i CSV. Solleva su errore di rete: il
    chiamante decide se riprovare piu' tardi (vedi sync_loop)."""
    async with aiohttp.ClientSession() as session:
        stations_text = await _fetch_text(session, _STATIONS_URL)
        prices_text = await _fetch_text(session, _PRICES_URL)
    return _parse_stations(stations_text), _parse_prices(prices_text)


async def _fetch_text(session: aiohttp.ClientSession, url: str) -> str:
    async with session.get(url, timeout=aiohttp.ClientTimeout(total=60)) as resp:
        resp.raise_for_status()
        # I file MIMIT sono in latin-1, non UTF-8 (contengono caratteri come
        # 'à' fuori range ASCII che altrimenti sollevano UnicodeDecodeError).
        raw = await resp.read()
        return raw.decode("latin-1")


def _parse_stations(text: str) -> list[Station]:
    lines = text.splitlines()[1:]  # riga 0: "Estrazione del ..."
    reader = csv.DictReader(lines, delimiter="|")
    out: list[Station] = []
    for row in reader:
        try:
            lat = float(row["Latitudine"])
            lon = float(row["Longitudine"])
            station_id = int(row["idImpianto"])
        except (KeyError, ValueError, TypeError):
            continue
        if lat == 0 or lon == 0:
            continue
        out.append(
            Station(
                id=station_id,
                brand=(row.get("Bandiera") or "").strip() or None,
                name=(row.get("Nome Impianto") or "").strip() or None,
                address=(row.get("Indirizzo") or "").strip() or None,
                comune=(row.get("Comune") or "").strip() or None,
                provincia=(row.get("Provincia") or "").strip() or None,
                lat=lat,
                lon=lon,
            )
        )
    return out


def _parse_prices(text: str) -> list[Price]:
    lines = text.splitlines()[1:]
    reader = csv.DictReader(lines, delimiter="|")
    out: list[Price] = []
    for row in reader:
        try:
            price = float(row["prezzo"])
            station_id = int(row["idImpianto"])
        except (KeyError, ValueError, TypeError):
            continue
        if not (_MIN_PLAUSIBLE_PRICE <= price <= _MAX_PLAUSIBLE_PRICE):
            continue
        fuel_type = (row.get("descCarburante") or "").strip()
        if not fuel_type:
            continue
        communicated_at = _parse_date(row.get("dtComu"))
        out.append(
            Price(
                station_id=station_id,
                fuel_type=fuel_type,
                is_self=row.get("isSelf") == "1",
                price=price,
                communicated_at=communicated_at,
            )
        )
    return out


def _parse_date(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.strptime(value, _DATE_FORMAT)
    except ValueError:
        return None


async def sync_once(db: Database) -> None:
    stations, prices = await fetch_all()
    await db.replace_fuel_prices(stations, prices)
    LOGGER.info("Prezzi MIMIT aggiornati: %d impianti, %d prezzi", len(stations), len(prices))


async def sync_loop(db: Database) -> None:
    """Task in background: sincronizza subito, poi ogni
    fuel_price_sync_interval_seconds. Non solleva mai: un fallimento (sito
    irraggiungibile) non deve far cadere il resto del servizio, che deve
    continuare a rispondere con l'ultimo snapshot buono che ha."""
    while True:
        try:
            await sync_once(db)
            await asyncio.sleep(settings.fuel_price_sync_interval_seconds)
        except asyncio.CancelledError:
            raise
        except Exception:
            LOGGER.exception("Sync prezzi MIMIT fallita, riprovo tra %d minuti", _RETRY_SECONDS // 60)
            await asyncio.sleep(_RETRY_SECONDS)
