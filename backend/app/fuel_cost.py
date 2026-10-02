"""Costo dei viaggi col metodo FIFO: il primo litro entrato e' il primo bruciato.

Il serbatoio e' una coda di lotti, uno per rifornimento, ciascuno col suo
prezzo. Ogni viaggio consuma litri dalla testa della coda: un viaggio a
cavallo di due rifornimenti paga una parte al prezzo vecchio e il resto al
nuovo. Con la media dei prezzi, invece, ogni viaggio pagherebbe lo stesso
prezzo anche quando il carburante che ha bruciato era stato pagato diverso.

Calcolato in lettura e mai salvato: confermare o correggere un rifornimento
in ritardo ricalcola da solo il costo di tutti i viaggi che vengono dopo.

I litri senza prezzo noto (carburante gia' nel serbatoio al primo
rifornimento registrato, rifornimenti ancora da confermare, viaggi senza
niente in coda) non diventano un costo inventato: vengono restituiti a parte
come `uncovered_l`, e l'app li prezza col suo prezzo di riserva.
"""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass
from datetime import datetime
from typing import Hashable

# Sotto questa quantita' (un centilitro) un lotto e' esaurito: evita lotti
# fantasma da 1e-15 litri lasciati dagli arrotondamenti dei float.
_EPSILON_L = 0.01

# Un rifornimento segnato come pieno ma dopo il quale il sensore legge meno di
# cosi' non era un pieno: la prima versione dell'app attivava "pieno" di
# default, e quei record riallineerebbero la coda a sproposito.
_FULL_TANK_MIN_PCT = 90.0


@dataclass(frozen=True)
class TripFuel:
    id: Hashable
    ended_at: datetime
    liters: float


@dataclass(frozen=True)
class RefuelLot:
    at: datetime
    liters: float
    # None finche' il rifornimento non e' confermato con la spesa.
    price_per_l: float | None
    full_tank: bool = False
    level_before_pct: float | None = None
    level_after_pct: float | None = None


@dataclass(frozen=True)
class TripCost:
    cost_eur: float
    uncovered_l: float


@dataclass
class _Lot:
    liters: float
    price_per_l: float | None


def fifo_costs(
    trips: list[TripFuel],
    refuels: list[RefuelLot],
    tank_capacity_l: float | None,
) -> dict[Hashable, TripCost]:
    # I viaggi si ordinano per fine, non per inizio: il backend registra il
    # rifornimento quando vede salire il livello, spesso all'accensione del
    # viaggio successivo, cioe' dopo il suo inizio. Ordinato per inizio,
    # quel viaggio finirebbe prima del rifornimento che invece lo precede.
    # A parita' di istante il rifornimento va prima.
    events: list[tuple[datetime, int, TripFuel | RefuelLot]] = [
        (r.at, 0, r) for r in refuels
    ] + [(t.ended_at, 1, t) for t in trips]
    events.sort(key=lambda e: (e[0], e[1]))

    queue: deque[_Lot] = deque()
    seen_refuel = False
    costs: dict[Hashable, TripCost] = {}

    for _, _, event in events:
        if isinstance(event, RefuelLot):
            target = _liters_before(event, tank_capacity_l, first=not seen_refuel)
            if target is not None:
                _reconcile(queue, target)
            seen_refuel = True
            if event.liters > _EPSILON_L:
                queue.append(_Lot(event.liters, event.price_per_l))
        else:
            costs[event.id] = _consume(queue, event.liters)

    return costs


def _liters_before(refuel: RefuelLot, capacity: float | None, first: bool) -> float | None:
    """Litri nel serbatoio prima di questo rifornimento, quando si sanno.

    Solo in due casi, perche' fuori da questi la coda e' piu' affidabile del
    sensore di livello (che oscilla di qualche punto):
    - un pieno vero: dopo c'e' la capacita' del serbatoio, quindi prima
      c'era la capacita' meno i litri messi;
    - il primo rifornimento registrato: prima non c'e' una coda da cui
      partire, e il carburante gia' presente va consumato per primo.
    """
    if not capacity:
        return None
    if refuel.full_tank and refuel.price_per_l is not None and _really_full(refuel):
        return max(capacity - refuel.liters, 0.0)
    if first and refuel.level_before_pct is not None:
        return capacity * refuel.level_before_pct / 100
    return None


def _really_full(refuel: RefuelLot) -> bool:
    return refuel.level_after_pct is None or refuel.level_after_pct >= _FULL_TANK_MIN_PCT


def _reconcile(queue: deque[_Lot], target_l: float) -> None:
    """Porta il contenuto della coda a target_l litri.

    Troppi litri: quelli piu' vecchi erano gia' stati bruciati (l'auto ha
    stimato un consumo un po' piu' basso del vero) e si tolgono dalla testa.
    Troppo pochi: c'e' carburante di cui non si conosce l'origine, messo in
    testa senza prezzo, cosi' viene consumato per primo.
    """
    total = sum(lot.liters for lot in queue)
    excess = total - target_l
    while excess > _EPSILON_L and queue:
        take = min(queue[0].liters, excess)
        queue[0].liters -= take
        excess -= take
        if queue[0].liters <= _EPSILON_L:
            queue.popleft()
    if excess < -_EPSILON_L:
        queue.appendleft(_Lot(-excess, None))


def _consume(queue: deque[_Lot], liters: float) -> TripCost:
    remaining = max(liters, 0.0)
    cost = 0.0
    uncovered = 0.0
    while remaining > _EPSILON_L and queue:
        lot = queue[0]
        take = min(lot.liters, remaining)
        if lot.price_per_l is None:
            uncovered += take
        else:
            cost += take * lot.price_per_l
        lot.liters -= take
        remaining -= take
        if lot.liters <= _EPSILON_L:
            queue.popleft()
    if remaining > _EPSILON_L:
        uncovered += remaining
    return TripCost(cost_eur=round(cost, 4), uncovered_l=round(uncovered, 3))
