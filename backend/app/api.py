"""API REST consumata dall'app mobile."""

from __future__ import annotations

import logging
import secrets
from contextlib import asynccontextmanager
from typing import Annotated
from uuid import UUID

from fastapi import Depends, FastAPI, Header, HTTPException, Query

from .config import settings
from .db import Database
from .service import MercedesService

LOGGER = logging.getLogger(__name__)

db = Database(settings.asyncpg_dsn)
service = MercedesService(db)


async def require_token(authorization: Annotated[str | None, Header()] = None) -> None:
    if not settings.api_auth_token:
        raise HTTPException(500, "API_AUTH_TOKEN non configurato")
    expected = f"Bearer {settings.api_auth_token}"
    # Confronto a tempo costante: un confronto normale rivela il token un
    # carattere alla volta.
    if authorization is None or not secrets.compare_digest(authorization, expected):
        raise HTTPException(401, "Non autorizzato")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await db.connect()
    try:
        await service.start()
    except Exception:
        # L'API deve restare in piedi anche se Mercedes rifiuta la connessione,
        # altrimenti non si riesce nemmeno a leggere i viaggi gia' registrati.
        LOGGER.exception("Connessione a Mercedes fallita; API attiva in sola lettura")
    yield
    await service.stop()
    await db.close()


app = FastAPI(title="MB Companion", lifespan=lifespan)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/state", dependencies=[Depends(require_token)])
async def get_state(vin: str | None = None) -> list[dict]:
    return await db.get_state(vin)


@app.get("/api/trips", dependencies=[Depends(require_token)])
async def list_trips(
    vin: str | None = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> list[dict]:
    return await db.list_trips(vin, limit, offset)


@app.get("/api/trips/{trip_id}", dependencies=[Depends(require_token)])
async def get_trip(trip_id: UUID) -> dict:
    trip = await db.get_trip(trip_id)
    if trip is None:
        raise HTTPException(404, "Viaggio non trovato")
    return trip
