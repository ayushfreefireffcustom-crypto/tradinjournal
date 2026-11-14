"""Pure helpers for stop loss / take profit levels (no MetaTrader5 import, so
they are unit-testable on any OS)."""

from typing import Any, Iterable


def level_or_none(value: Any) -> str | None:
    """MT5 reports "no stop" as 0.0. Decimal string for a real level, else None."""
    try:
        v = float(value)
    except (TypeError, ValueError):
        return None
    if v != v or v <= 0:  # NaN or unset
        return None
    return str(value) if isinstance(value, str) else repr(float(v))


def order_levels(orders: Iterable[Any] | None) -> dict[int, tuple[str | None, str | None]]:
    """Order ticket -> (sl, tp) for every history order that carried a level."""
    out: dict[int, tuple[str | None, str | None]] = {}
    for o in orders or ():
        sl = level_or_none(getattr(o, "sl", None))
        tp = level_or_none(getattr(o, "tp", None))
        if sl is not None or tp is not None:
            out[int(getattr(o, "ticket"))] = (sl, tp)
    return out
