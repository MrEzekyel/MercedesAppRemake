"""Traduzione degli eventi protobuf dell'auto in valori Python.

L'auto manda VEPUpdate: una mappa nome-attributo -> VehicleAttributeStatus,
dove il valore vero sta in uno di parecchi campi alternativi (oneof). Qui lo
estraiamo e teniamo solo gli attributi che ci interessano.
"""

from __future__ import annotations

from typing import Any

# Il valore utile sta sempre in uno di questi campi; gli altri membri della
# oneof sono strutture complesse (profili di ricarica, timer...) che non usiamo.
_SCALAR_FIELDS = frozenset({"int_value", "bool_value", "string_value", "double_value"})

# Stato di accensione che corrisponde a motore avviato.
IGNITION_ON = "4"


def attribute_value(attr: Any) -> Any:
    """Estrae il valore scalare da un VehicleAttributeStatus, o None."""
    kind = attr.WhichOneof("attribute_type")
    if kind in _SCALAR_FIELDS:
        return getattr(attr, kind)
    return None


def parse_update(update: Any) -> dict[str, Any]:
    """Appiattisce un VEPUpdate in un dizionario nome -> valore."""
    return {key: attribute_value(attr) for key, attr in update.attributes.items()}


def is_ignition_on(attrs: dict[str, Any]) -> bool | None:
    """True se il motore risulta acceso, None se l'evento non lo dice.

    Distinguere 'spento' da 'non riportato' e' essenziale: la maggior parte
    degli eventi aggiorna solo pochi attributi, e trattare un'assenza come
    spegnimento chiuderebbe i viaggi a meta' strada.
    """
    if "ignitionstate" not in attrs:
        return None
    return str(attrs["ignitionstate"]) == IGNITION_ON


def position(attrs: dict[str, Any]) -> tuple[float, float] | None:
    """Coordinate (lat, lon) se l'evento le contiene entrambe."""
    lat = attrs.get("positionLat")
    lon = attrs.get("positionLong")
    if lat is None or lon is None:
        return None
    if lat == 0 and lon == 0:
        return None
    return float(lat), float(lon)
