"""Pydantic request/response models for the MT5 bridge."""

from datetime import datetime
from pydantic import BaseModel


# ─── Shared credentials ───────────────────────────────────────────────────────

class Credentials(BaseModel):
    login: int
    password: str
    server: str


# ─── /verify ─────────────────────────────────────────────────────────────────

class VerifyRequest(Credentials):
    pass

class VerifyResponse(BaseModel):
    login: int
    name: str
    server: str
    currency: str
    balance: str        # Decimal string — never float
    margin_mode: str    # "NETTING" | "HEDGING"


# ─── /account ────────────────────────────────────────────────────────────────

class AccountRequest(Credentials):
    pass

class AccountResponse(BaseModel):
    login: int
    name: str
    server: str
    currency: str
    balance: str
    equity: str
    margin: str
    free_margin: str
    margin_mode: str
    leverage: int


# ─── /deals ──────────────────────────────────────────────────────────────────

class DealsRequest(Credentials):
    from_time: datetime
    to_time: datetime

class RawDeal(BaseModel):
    deal_ticket: int
    order_ticket: int
    position_id: int
    symbol: str
    type: int           # MT5 DEAL_TYPE_* constant (0=BUY, 1=SELL, 2=BALANCE …)
    entry: int          # MT5 DEAL_ENTRY_* constant (0=IN, 1=OUT, 2=INOUT, 3=OUT_BY)
    volume: str         # Decimal string
    price: str
    profit: str
    commission: str
    swap: str
    fee: str
    deal_time: int      # Unix timestamp (seconds)
    magic: int
    comment: str
    reason: int

class DealsResponse(BaseModel):
    deals: list[RawDeal]
    total: int


# ─── /positions ──────────────────────────────────────────────────────────────

class PositionsRequest(Credentials):
    pass

class OpenPosition(BaseModel):
    position_id: int
    symbol: str
    type: int           # 0=BUY, 1=SELL
    volume: str
    price_open: str
    price_current: str
    profit: str
    commission: str
    swap: str
    open_time: int      # Unix timestamp

class PositionsResponse(BaseModel):
    positions: list[OpenPosition]
    total: int
