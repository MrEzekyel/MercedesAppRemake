"""API REST consumata dall'app mobile."""

from __future__ import annotations

import asyncio
import logging
import secrets
from contextlib import asynccontextmanager
from typing import Annotated
from uuid import UUID

from fastapi import Depends, FastAPI, Header, HTTPException, Query
from pydantic import BaseModel

from . import commands, mimit
from .config import settings
from .db import Database
from .service import MercedesService

LOGGER = logging.getLogger(__name__)

db = Database(settings.asyncpg_dsn)
service = MercedesService(db)
_fuel_sync_task: asyncio.Task | None = None


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
    global _fuel_sync_task
    await db.connect()
    try:
        await service.start()
    except Exception:
        # L'API deve restare in piedi anche se Mercedes rifiuta la connessione,
        # altrimenti non si riesce nemmeno a leggere i viaggi gia' registrati.
        LOGGER.exception("Connessione a Mercedes fallita; API attiva in sola lettura")
    _fuel_sync_task = asyncio.create_task(mimit.sync_loop(db))
    yield
    _fuel_sync_task.cancel()
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


class VehicleSettings(BaseModel):
    """None e' un valore valido: azzera l'override e torna alla media."""

    fuel_price_eur_per_l: float | None = None


@app.patch("/api/vehicles/{vin}/settings", dependencies=[Depends(require_token)])
async def update_settings(vin: str, body: VehicleSettings) -> dict:
    price = body.fuel_price_eur_per_l
    if price is not None and not 0 < price < 10:
        raise HTTPException(422, "Prezzo al litro fuori scala")
    updated = await db.set_fuel_price(vin, price)
    if updated is None:
        raise HTTPException(404, "Veicolo non trovato")
    return updated


# Allargamento progressivo finche' non si trova un campione ragionevole di
# distributori: 10 km basta in citta', ma un'auto ferma in campagna
# potrebbe non avere niente entro quel raggio.
_AVERAGE_RADII_KM = [10, 25, 50, 100]


async def _resolve_position(vin: str | None, lat: float | None, lon: float | None) -> tuple[float, float]:
    if lat is not None and lon is not None:
        return lat, lon
    if vin is None:
        raise HTTPException(422, "Serve vin oppure lat e lon")
    position = await db.get_vehicle_position(vin)
    if position is None:
        raise HTTPException(404, "Posizione del veicolo non disponibile")
    return position


@app.get("/api/fuel-prices/average", dependencies=[Depends(require_token)])
async def fuel_price_average(
    vin: str | None = None,
    lat: float | None = None,
    lon: float | None = None,
) -> dict:
    """Prezzo medio del self-service nella zona del veicolo (o delle
    coordinate passate). Usato come stima di fallback quando l'utente non
    ha impostato un prezzo e non ha ancora rifornimenti confermati."""
    position = await _resolve_position(vin, lat, lon)
    fuel_type = settings.fuel_type_mimit

    local = await db.average_fuel_price_near(*position, fuel_type, is_self=True, radii_km=_AVERAGE_RADII_KM)
    if local is not None:
        return {**local, "fuel_type": fuel_type, "source": "locale"}

    national = await db.national_average_fuel_price(fuel_type, is_self=True)
    if national is not None:
        return {**national, "fuel_type": fuel_type, "source": "nazionale"}

    raise HTTPException(503, "Prezzi carburante non ancora disponibili")


@app.get("/api/fuel-prices/nearby", dependencies=[Depends(require_token)])
async def fuel_prices_nearby(
    vin: str | None = None,
    lat: float | None = None,
    lon: float | None = None,
    radius_km: Annotated[float, Query(gt=0, le=100)] = 15,
    limit: Annotated[int, Query(ge=1, le=50)] = 10,
) -> list[dict]:
    """Distributori piu' economici entro il raggio, per il suggerimento
    di prezzo quando si conferma un rifornimento."""
    position = await _resolve_position(vin, lat, lon)
    return await db.nearby_fuel_prices(
        *position, settings.fuel_type_mimit, is_self=True, radius_km=radius_km, limit=limit
    )


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
