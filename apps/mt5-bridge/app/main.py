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
    if x_bridge_secret != settings.shared_secret:
        log.warning("Rejected — wrong X-Bridge-Secret")
        raise HTTPException(status_code=401, detail="Unauthorized")


# ─── MT5 helpers ──────────────────────────────────────────────────────────────

# Tunables for the self-healing connect. A dropped MT5 session surfaces as
# initialize()/login() failing (classically error -6 "Terminal: Authorization
# failed"); we recover by tearing down the IPC pipe and re-initializing WITH the
# account credentials, which both attaches to the terminal and authorizes in one
# step instead of relying on the terminal's ambient (and sometimes dropped)
# session. Kept small so a genuinely bad login fails fast rather than hanging the
# API request.
CONNECT_ATTEMPTS = 3
CONNECT_RETRY_DELAY_S = 1.0
CONNECT_TIMEOUT_MS = 15_000


def _last_error() -> tuple:
    """mt5.last_error() that never itself raises."""
    try:
        return tuple(mt5.last_error())
    except Exception:
        return (None, "unknown")


def _is_connected(login: int) -> bool:
    """True only if the terminal is attached, online, and authorized on `login`."""
    try:
        info = mt5.account_info()
        term = mt5.terminal_info()
    except Exception:
        return False
    return (
        info is not None
        and int(info.login) == int(login)
        and term is not None
        and bool(getattr(term, "connected", False))
    )


def _connect(login: int, password: str, server: str) -> None:
    """
    Ensure the terminal is initialized AND authorized on `login`, self-healing
    from dropped/unauthorized sessions (MT5 error -6). Raises HTTPException on a
    hard failure so the API can surface an honest status.

    Callers already hold the global _lock, so MT5 calls never overlap and the
    tear-down / re-initialize below is safe.
    """
    # Fast path: already attached, online and on the right account — no re-auth.
    if _is_connected(login):
        return

    last: tuple = (None, "no attempt")
    for attempt in range(1, CONNECT_ATTEMPTS + 1):
        # Initialize WITH credentials: attaches to the terminal *and* authorizes
        # the account in one call. This is the key fix — it does not depend on
        # the terminal's own session being alive, so a dropped session recovers.
        ok = mt5.initialize(
            path=settings.terminal_path,
            login=int(login),
            password=password,
            server=server,
            timeout=CONNECT_TIMEOUT_MS,
        )

        # If we're attached but on a different account (multi-account switching),
        # force an explicit login onto the requested one.
        if ok and not _is_connected(login):
            mt5.login(int(login), password=password, server=server, timeout=CONNECT_TIMEOUT_MS)

        if _is_connected(login):
            if attempt > 1:
                log.info(f"[connect] recovered on attempt {attempt} — {login}@{server}")
            return

        last = _last_error()
        log.warning(
            f"[connect] attempt {attempt}/{CONNECT_ATTEMPTS} failed for {login}@{server}: {last} — resetting IPC"
        )

        # Drop the poisoned Python<->terminal connection before retrying. This
        # only closes our IPC pipe; it does NOT close the terminal application.
        try:
            mt5.shutdown()
        except Exception:
            pass
        time.sleep(CONNECT_RETRY_DELAY_S)

    code, msg = (last + (None, None))[:2]
    # -6 (and login-refused) means the credentials/server were rejected by the
    # trade server -> 401 so the client re-checks password/server. Everything
    # else is treated as a transient terminal/infra problem -> 503.
    status = 401 if code == -6 else 503
    log.error(f"[connect] giving up on {login}@{server} after {CONNECT_ATTEMPTS} tries: ({code}, {msg})")
    raise HTTPException(
        status_code=status,
        detail=f"MT5 connect failed for {login}@{server}: ({code}, {msg})",
    )


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
        _connect(req.login, req.password, req.server)
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
        _connect(req.login, req.password, req.server)
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
        _connect(req.login, req.password, req.server)
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
        _connect(req.login, req.password, req.server)
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
