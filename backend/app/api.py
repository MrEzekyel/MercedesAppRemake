"""API REST consumata dall'app mobile."""

from __future__ import annotations

import logging
import secrets
from contextlib import asynccontextmanager
from typing import Annotated
from uuid import UUID

from fastapi import Depends, FastAPI, Header, HTTPException, Query
from pydantic import BaseModel

from . import commands
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


class ConfirmRefuel(BaseModel):
    liters: float
    cost_eur: float | None = None
    full_tank: bool = True
    notes: str | None = None


@app.get("/api/refuels", dependencies=[Depends(require_token)])
async def list_refuels(
    vin: str | None = None,
    status: Annotated[str | None, Query(pattern="^(pending|confirmed)$")] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> list[dict]:
    return await db.list_refuels(vin, status, limit, offset)


@app.post("/api/refuels/{refuel_id}/confirm", dependencies=[Depends(require_token)])
async def confirm_refuel(refuel_id: UUID, body: ConfirmRefuel) -> dict:
    refuel = await db.confirm_refuel(refuel_id, body.liters, body.cost_eur, body.full_tank, body.notes)
    if refuel is None:
        raise HTTPException(404, "Rifornimento non trovato")
    return refuel


@app.delete("/api/refuels/{refuel_id}", dependencies=[Depends(require_token)])
async def delete_refuel(refuel_id: UUID) -> dict[str, bool]:
    deleted = await db.delete_refuel(refuel_id)
    if not deleted:
        raise HTTPException(404, "Rifornimento non trovato")
    return {"deleted": True}


async def _send_command(vin: str, command: str) -> dict:
    try:
        command_id = await service.send_command(vin, command)
    except RuntimeError as exc:
        raise HTTPException(503, str(exc)) from exc
    return {"command_id": str(command_id), "status": "pending"}


@app.post("/api/vehicles/{vin}/lock", dependencies=[Depends(require_token)])
async def lock_vehicle(vin: str) -> dict:
    return await _send_command(vin, commands.LOCK)


@app.post("/api/vehicles/{vin}/unlock", dependencies=[Depends(require_token)])
async def unlock_vehicle(vin: str) -> dict:
    return await _send_command(vin, commands.UNLOCK)


@app.post("/api/vehicles/{vin}/climate/start", dependencies=[Depends(require_token)])
async def start_climate(vin: str) -> dict:
    return await _send_command(vin, commands.CLIMATE_START)


@app.post("/api/vehicles/{vin}/climate/stop", dependencies=[Depends(require_token)])
async def stop_climate(vin: str) -> dict:
    return await _send_command(vin, commands.CLIMATE_STOP)


@app.post("/api/vehicles/{vin}/lights", dependencies=[Depends(require_token)])
async def flash_lights(vin: str) -> dict:
    return await _send_command(vin, commands.LIGHTS)


@app.post("/api/vehicles/{vin}/horn", dependencies=[Depends(require_token)])
async def sound_horn(vin: str) -> dict:
    return await _send_command(vin, commands.HORN)


@app.post("/api/vehicles/{vin}/windows/open", dependencies=[Depends(require_token)])
async def open_windows(vin: str) -> dict:
    return await _send_command(vin, commands.WINDOWS_OPEN)


@app.post("/api/vehicles/{vin}/windows/close", dependencies=[Depends(require_token)])
async def close_windows(vin: str) -> dict:
    return await _send_command(vin, commands.WINDOWS_CLOSE)


@app.get("/api/commands/{command_id}", dependencies=[Depends(require_token)])
async def get_command(command_id: UUID) -> dict:
    command = await db.get_command(command_id)
    if command is None:
        raise HTTPException(404, "Comando non trovato")
    return command
