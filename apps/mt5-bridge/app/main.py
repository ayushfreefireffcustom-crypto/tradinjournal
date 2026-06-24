"""
MT5 bridge (FastAPI) — read-only connector to MetaTrader 5.

KEY DESIGN: mt5.initialize() is called ONCE at startup and kept alive for the
entire process lifetime. Calling mt5.shutdown() after every request kills the
IPC pipe and causes the next request to timeout. Each request acquires a lock
so MT5 calls never overlap.
"""

import logging
import threading
import time
from contextlib import asynccontextmanager

import MetaTrader5 as mt5
from fastapi import Depends, FastAPI, Header, HTTPException

from app.config import settings
from app.models import (
    AccountRequest, AccountResponse,
    DealsRequest, DealsResponse, RawDeal,
    OpenPosition, PositionsRequest, PositionsResponse,
    VerifyRequest, VerifyResponse,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("mt5-bridge")

# One request at a time — MT5 Python lib is not thread-safe
_lock = threading.Lock()


# ─── Lifespan — initialize once, shutdown on exit ────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info(f"Bridge starting — connecting to MT5 terminal at {settings.terminal_path}")
    if mt5.initialize(path=settings.terminal_path):
        info = mt5.terminal_info()
        log.info(f"MT5 connected — build={getattr(info, 'build', '?')} path={getattr(info, 'path', '?')}")
    else:
        log.warning(f"MT5 not reachable at startup: {mt5.last_error()} — will retry on first request")
    yield
    log.info("Bridge shutting down — closing MT5")
    mt5.shutdown()


app = FastAPI(title="MT5 Bridge", version="1.0.0", lifespan=lifespan, docs_url=None, redoc_url=None)


# ─── Auth ─────────────────────────────────────────────────────────────────────

def verify_secret(x_bridge_secret: str = Header(...)):
    if x_bridge_secret != settings.bridge_shared_secret:
        log.warning("Rejected — wrong X-Bridge-Secret")
        raise HTTPException(status_code=401, detail="Unauthorized")


# ─── MT5 helpers ──────────────────────────────────────────────────────────────

def _ensure_initialized() -> None:
    """Re-attach to the terminal if the IPC pipe dropped."""
    if not mt5.initialize(path=settings.terminal_path):
        err = mt5.last_error()
        log.error(f"mt5.initialize() failed: {err}")
        raise HTTPException(status_code=503, detail=f"MT5 init failed: {err}")


def _login(login: int, password: str, server: str) -> None:
    """Switch to the requested account if not already connected."""
    _ensure_initialized()

    current = mt5.account_info()
    if current is not None and current.login == login:
        log.info(f"Already on account {current.login} ({current.server}) — skipping login")
        return

    log.info(f"mt5.login() login={login} server={server}")
    ok = mt5.login(login, password=password, server=server, timeout=15_000)
    if not ok:
        code, msg = mt5.last_error()
        if code == 1:
            log.info("mt5.login() quirk [1/Success] — treating as already connected")
            return
        log.error(f"mt5.login() failed [{code}]: {msg}")
        raise HTTPException(status_code=400, detail=f"MT5 login failed [{code}]: {msg}")

    log.info(f"mt5.login() OK — {login} on {server}")


def _margin_mode(mode_int: int) -> str:
    return "HEDGING" if mode_int == 2 else "NETTING"


# ─── Health ───────────────────────────────────────────────────────────────────

@app.get("/health")
def health() -> dict:
    with _lock:
        ok = mt5.initialize()
        if ok:
            info = mt5.terminal_info()
            log.info(f"Health OK — build={getattr(info, 'build', '?')}")
        else:
            log.warning(f"Health — terminal not reachable: {mt5.last_error()}")
    return {"status": "ok", "service": "mt5-bridge", "terminal": ok}


# ─── POST /verify ─────────────────────────────────────────────────────────────

@app.post("/verify", response_model=VerifyResponse, dependencies=[Depends(verify_secret)])
def verify(req: VerifyRequest) -> VerifyResponse:
    log.info(f"[verify] login={req.login} server={req.server}")
    with _lock:
        _login(req.login, req.password, req.server)
        info = mt5.account_info()
        if info is None:
            log.error(f"[verify] account_info() returned None: {mt5.last_error()}")
            raise HTTPException(status_code=502, detail="Could not read account info after login")
        log.info(f"[verify] OK — name={info.name} balance={info.balance} {info.currency} mode={_margin_mode(info.margin_mode)}")
        return VerifyResponse(
            login=info.login,
            name=info.name,
            server=info.server,
            currency=info.currency,
            balance=str(info.balance),
            margin_mode=_margin_mode(info.margin_mode),
        )


# ─── POST /account ────────────────────────────────────────────────────────────

@app.post("/account", response_model=AccountResponse, dependencies=[Depends(verify_secret)])
def account(req: AccountRequest) -> AccountResponse:
    log.info(f"[account] login={req.login} server={req.server}")
    with _lock:
        _login(req.login, req.password, req.server)
        info = mt5.account_info()
        if info is None:
            log.error(f"[account] account_info() returned None: {mt5.last_error()}")
            raise HTTPException(status_code=502, detail="Could not read account info")
        log.info(f"[account] balance={info.balance} equity={info.equity} margin={info.margin}")
        return AccountResponse(
            login=info.login,
            name=info.name,
            server=info.server,
            currency=info.currency,
            balance=str(info.balance),
            equity=str(info.equity),
            margin=str(info.margin),
            free_margin=str(info.margin_free),
            margin_mode=_margin_mode(info.margin_mode),
            leverage=info.leverage,
        )


# ─── POST /deals ──────────────────────────────────────────────────────────────

@app.post("/deals", response_model=DealsResponse, dependencies=[Depends(verify_secret)])
def deals(req: DealsRequest) -> DealsResponse:
    log.info(f"[deals] login={req.login} server={req.server} from={req.from_time} to={req.to_time}")
    with _lock:
        _login(req.login, req.password, req.server)
        mt5.history_orders_get(req.from_time, req.to_time)
        time.sleep(1)
        raw = mt5.history_deals_get(req.from_time, req.to_time)
        if raw is None:
            log.warning(f"[deals] history_deals_get returned None: {mt5.last_error()}")
            return DealsResponse(deals=[], total=0)
        log.info(f"[deals] pulled {len(raw)} deals")
        result: list[RawDeal] = []
        for d in raw:
            result.append(RawDeal(
                deal_ticket=d.ticket,
                order_ticket=d.order,
                position_id=d.position_id,
                symbol=d.symbol,
                type=d.type,
                entry=d.entry,
                volume=str(d.volume),
                price=str(d.price),
                profit=str(d.profit),
                commission=str(d.commission),
                swap=str(d.swap),
                fee=str(d.fee),
                deal_time=d.time,
                magic=d.magic,
                comment=d.comment or "",
                reason=d.reason,
            ))
        return DealsResponse(deals=result, total=len(result))


# ─── POST /positions ──────────────────────────────────────────────────────────

@app.post("/positions", response_model=PositionsResponse, dependencies=[Depends(verify_secret)])
def positions(req: PositionsRequest) -> PositionsResponse:
    log.info(f"[positions] login={req.login} server={req.server}")
    with _lock:
        _login(req.login, req.password, req.server)
        raw = mt5.positions_get()
        if raw is None:
            log.warning(f"[positions] positions_get returned None: {mt5.last_error()}")
            return PositionsResponse(positions=[], total=0)
        log.info(f"[positions] {len(raw)} open positions")
        result: list[OpenPosition] = []
        for p in raw:
            result.append(OpenPosition(
                position_id=p.ticket,
                symbol=p.symbol,
                type=p.type,
                volume=str(p.volume),
                price_open=str(p.price_open),
                price_current=str(p.price_current),
                profit=str(p.profit),
                commission=str(p.commission),
                swap=str(p.swap),
                open_time=p.time,
            ))
        return PositionsResponse(positions=result, total=len(result))
