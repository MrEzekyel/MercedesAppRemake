"""Rilevamento rifornimenti dai salti del livello carburante.

L'API Mercedes non sa quanto si e' speso al distributore, ma il livello
carburante che riporta permette di accorgersi CHE un rifornimento e'
avvenuto: crea una bozza che l'utente completa in app con spesa e litri
veri, invece di dover ricordarsi di aprire l'app ogni volta prima di
staccare la pompa.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

from .config import settings
from .db import Database

LOGGER = logging.getLogger(__name__)

# Sotto questa soglia (punti percentuali) il salto e' rumore di sensore, non
# un rifornimento: il livello oscilla di qualche punto anche da fermi.
MIN_JUMP_PCT = 8.0


class RefuelDetector:
    def __init__(self, db: Database) -> None:
        self._db = db

    async def handle(self, vin: str, attrs: dict[str, Any], ts: datetime) -> None:
        after = _as_float(attrs.get("tanklevelpercent"))
        if after is None:
            return

        before = await self._db.get_fuel_level(vin)
        if before is None or after - before < MIN_JUMP_PCT:
            return

        odometer = _as_int(attrs.get("odo"))
        capacity = await self._db.get_tank_capacity(vin)
        # Solo una stima di partenza: l'utente la corregge in app con il
        # valore vero della colonnina. Resta None finche' non si imposta
        # tank_capacity_l per il veicolo (nessun dato Mercedes lo fornisce).
        liters_estimated = (
            round(capacity * (after - before) / 100, 1) if capacity else None
        )

        await self._db.create_pending_refuel(
            vin, ts, odometer, before, after, liters_estimated
        )
        LOGGER.info(
            "Rifornimento rilevato per %s: %.0f%% -> %.0f%%", _mask(vin), before, after
        )


def _as_float(value: Any) -> float | None:
    try:
        return float(value) if value is not None else None
    except (TypeError, ValueError):
        return None


def _as_int(value: Any) -> int | None:
    try:
        return int(value) if value is not None else None
    except (TypeError, ValueError):
        return None


def _mask(vin: str) -> str:
    return f"...{vin[-4:]}" if len(vin) > 4 else "***"
