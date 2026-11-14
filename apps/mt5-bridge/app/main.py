"""
MT5 bridge (FastAPI) — read-only connector to MetaTrader 5.

KEY DESIGN: mt5.initialize() is called ONCE at startup and kept alive for the
entire process lifetime. Calling mt5.shutdown() after every request kills the
IPC pipe and causes the next request to timeout. Each request acquires a lock
so MT5 calls never overlap.
"""

import logging
import os
import subprocess
import threading
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone

import MetaTrader5 as mt5
from fastapi import Depends, FastAPI, Header, HTTPException

from app.config import settings
from app.models import (
    AccountRequest, AccountResponse,
    Candle, CandlesRequest, CandlesResponse,
    DealsRequest, DealsResponse, RawDeal,
    DiagnoseRequest,
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


# What MT5's (code, message) pairs mean, for logs and the /diagnose report.
MT5_ERRORS = {
    1: "success",
    -1: "generic failure",
    -2: "invalid arguments",
    -3: "out of memory",
    -4: "not found",
    -5: "unsupported terminal version",
    -6: "authorization failed (login, password or server rejected)",
    -7: "unsupported",
    -8: "auto-trading disabled",
    -10000: "IPC internal error",
    -10001: "IPC send failed",
    -10002: "IPC receive failed",
    -10003: "IPC initialization failed",
    -10004: "no IPC connection (terminal dropped the link)",
    -10005: "IPC timeout",
}
IPC_ERRORS = {-10000, -10001, -10002, -10003, -10004, -10005}

# A successful account login proves the terminal itself works. If one happened
# this recently, a login that keeps failing belongs to that account, not to us.
TERMINAL_PROVEN_S = 15 * 60
_last_ok_login = {"at": 0.0, "login": None}


def _mark_login_ok(login: int) -> None:
    _last_ok_login["at"] = time.monotonic()
    _last_ok_login["login"] = int(login)


# The last account that signed in fine, kept in memory only (never logged or
# returned) so a failing login can be checked against a known-good one on the
# spot instead of waiting for another account to happen to sync.
_last_good: dict = {}


def _remember_good(login: int, password: str, server: str) -> None:
    _last_good.update(login=int(login), password=password, server=server)


def _terminal_proven() -> bool:
    age = _last_ok_age_s()
    return age is not None and age < TERMINAL_PROVEN_S


def _reprove_terminal(failed_login: int) -> dict | None:
    """
    Sign back in to the last known-good account to see whether the terminal
    works right now. Returns {"login", "ok", "mt5"?} or None when there is no
    other good account to try. Also leaves the terminal on a working account
    instead of stuck on a rejected one. A good account that now fails is
    forgotten, so a later password change there can't mislead us.
    """
    good = dict(_last_good)
    if not good or good["login"] == int(failed_login):
        return None
    try:
        mt5.shutdown()
    except Exception:
        pass
    failures = _try_login(good["login"], good["password"], good["server"], 1)
    if not failures:
        log.info(f"[connect] terminal re-proven by signing in to {good['login']}@{good['server']}")
        return {"login": good["login"], "ok": True}
    _last_good.clear()
    code, msg = (tuple(failures[-1]) + (None, None))[:2]
    log.warning(f"[connect] re-proof via {good['login']}@{good['server']} failed too: ({code}, {msg})")
    return {"login": good["login"], "ok": False, "mt5": _mt5_error(code, msg)}


def _last_ok_age_s() -> float | None:
    return None if not _last_ok_login["at"] else time.monotonic() - _last_ok_login["at"]


def _terminal_process_running() -> bool | None:
    """Is a terminal process with our executable's name running? None if we can't tell."""
    exe = os.path.basename(settings.terminal_path).lower()
    try:
        out = subprocess.run(
            ["tasklist", "/FI", f"IMAGENAME eq {exe}", "/NH", "/FO", "CSV"],
            capture_output=True, text=True, timeout=5,
        ).stdout.lower()
    except Exception:
        return None
    return exe in out


def _mt5_error(code, msg) -> dict:
    return {"code": code, "message": msg, "meaning": MT5_ERRORS.get(code, "unknown MT5 error")}


def _classify_failure(login: int, server: str, attempts: list[tuple], reproof: dict | None = None) -> tuple[int, dict]:
    """
    Turn a failed connect into (http status, detail) that says exactly whose
    problem it is. Codes the API acts on:
      LOGIN_REJECTED (422) — this account can't sign in; the user must fix it.
        reason AUTH_FAILED    MT5 said so outright (-6).
        reason LOGIN_DROPPED  the terminal works (another account signed in
                              recently) but drops the link on this login: a
                              changed investor password, a disabled/archived
                              account or a wrong server name.
      TERMINAL_DOWN (503)        the terminal process isn't running.
      TERMINAL_UNAVAILABLE (503) the terminal didn't answer and nothing proves it
                                 works right now; don't blame the user yet.
    """
    code, msg = (tuple(attempts[-1] if attempts else (None, "no attempt")) + (None, None))[:2]
    age = _last_ok_age_s()
    proc = _terminal_process_running()
    proven = age is not None and age < TERMINAL_PROVEN_S
    terminal = {
        "process_running": proc,
        "last_ok_login_s_ago": None if age is None else int(age),
        "path": settings.terminal_path,
        "reproof": None if reproof is None else {k: v for k, v in reproof.items() if k != "password"},
    }
    base = {
        "login": int(login), "server": server,
        "mt5": _mt5_error(code, msg),
        "attempts": [_mt5_error(*(tuple(a) + (None, None))[:2]) for a in attempts],
        "terminal": terminal,
    }
    if code == -6:
        return 422, {**base, "code": "LOGIN_REJECTED", "reason": "AUTH_FAILED",
                     "message": f"MT5 rejected {login}@{server}: wrong login, investor password or server name."}
    if code in IPC_ERRORS and proven:
        how = ("it signed in to another account fine just now" if reproof and reproof.get("ok")
               else f"an account signed in {int(age // 60)} min ago")
        return 422, {**base, "code": "LOGIN_REJECTED", "reason": "LOGIN_DROPPED",
                     "message": (f"The terminal is working ({how}) but drops the "
                                 f"connection when signing in to {login}@{server}. Usually the investor password changed, "
                                 "the account was disabled or archived, or the server name is wrong.")}
    if proc is False:
        return 503, {**base, "code": "TERMINAL_DOWN", "reason": "PROCESS_NOT_RUNNING",
                     "message": f"The MT5 terminal ({os.path.basename(settings.terminal_path)}) is not running on the bridge host."}
    if code == -10005:
        return 503, {**base, "code": "TERMINAL_UNAVAILABLE", "reason": "TIMEOUT",
                     "message": "The MT5 terminal timed out; it may be busy, updating or reconnecting to the broker."}
    if reproof and not reproof.get("ok"):
        return 503, {**base, "code": "TERMINAL_UNAVAILABLE", "reason": "REPROOF_FAILED",
                     "message": (f"MT5 failed ({code}, {msg}) for {login}, and signing back in to a previously working "
                                 f"account ({reproof['login']}) failed too, so the terminal itself looks unwell.")}
    return 503, {**base, "code": "TERMINAL_UNAVAILABLE", "reason": "UNPROVEN",
                 "message": (f"MT5 failed ({code}, {msg}) and no login has succeeded in the last "
                             f"{TERMINAL_PROVEN_S // 60} min, so it can't be pinned on this account yet.")}


def _try_login(login: int, password: str, server: str, attempts_max: int) -> list[tuple]:
    """Attach + authorize on `login`. Returns the (code, message) of each failed attempt; [] on success."""
    failures: list[tuple] = []
    for attempt in range(1, attempts_max + 1):
        # Initialize WITH credentials: attaches to the terminal *and* authorizes
        # the account in one call, so a dropped terminal session recovers.
        ok = mt5.initialize(
            path=settings.terminal_path,
            login=int(login),
            password=password,
            server=server,
            timeout=CONNECT_TIMEOUT_MS,
        )
        # Attached but on a different account (multi-account switching): log in explicitly.
        if ok and not _is_connected(login):
            mt5.login(int(login), password=password, server=server, timeout=CONNECT_TIMEOUT_MS)
        if _is_connected(login):
            _mark_login_ok(login)
            _remember_good(login, password, server)
            if attempt > 1:
                log.info(f"[connect] recovered on attempt {attempt} — {login}@{server}")
            return []
        failures.append(_last_error())
        code, msg = (failures[-1] + (None, None))[:2]
        log.warning(
            f"[connect] attempt {attempt}/{attempts_max} failed for {login}@{server}: "
            f"({code}, {msg}) {MT5_ERRORS.get(code, '')} — resetting IPC"
        )
        if code == -6:
            break  # an outright rejection won't change on retry
        # Drop the poisoned Python<->terminal link before retrying. This only
        # closes our IPC pipe; it does NOT close the terminal application.
        try:
            mt5.shutdown()
        except Exception:
            pass
        time.sleep(CONNECT_RETRY_DELAY_S)
    return failures


def _failure_detail(login: int, server: str, failures: list[tuple]) -> tuple[int, dict]:
    """Classify a failed login, first re-proving the terminal if an IPC error has nothing recent to go on."""
    code = (tuple(failures[-1]) + (None,))[0] if failures else None
    # A terminal that isn't even running is reported as such; no point re-checking it.
    reproof = (_reprove_terminal(login)
               if code in IPC_ERRORS and not _terminal_proven() and _terminal_process_running() is not False
               else None)
    return _classify_failure(login, server, failures, reproof)


def _connect(login: int, password: str, server: str) -> None:
    """
    Ensure the terminal is initialized AND authorized on `login`, self-healing
    from dropped sessions. On failure raises HTTPException whose detail says
    whose problem it is (see _classify_failure). Callers hold the global _lock.
    """
    if _is_connected(login):
        _mark_login_ok(login)
        _remember_good(login, password, server)
        return
    failures = _try_login(login, password, server, CONNECT_ATTEMPTS)
    if not failures:
        return
    status, detail = _failure_detail(login, server, failures)
    log.error(f"[connect] {detail['code']}/{detail['reason']} for {login}@{server}: {detail['message']}")
    raise HTTPException(status_code=status, detail=detail)


def _margin_mode(mode_int: int) -> str:
    return "HEDGING" if mode_int == 2 else "NETTING"


def _newest_quote_time() -> int | None:
    """Newest last-quote time across Market Watch, in the trade server's wall clock."""
    try:
        syms = mt5.symbols_get() or ()
    except Exception:
        return None
    times = [int(s.time) for s in syms if getattr(s, "visible", False) and getattr(s, "time", 0)]
    return max(times) if times else None


def _live_server_time(before: int | None) -> tuple[int | None, int]:
    """
    (server_time, utc_now). MT5 reports every time (deals, bars, quotes) in the
    trade server's wall clock, not UTC, so the API needs the server clock to
    convert. The newest quote only dates that clock if quotes are moving, so
    server_time is None unless it advanced since `before` (sampled earlier in
    the same call). That rules out weekends, holidays and a freshly connected
    terminal, where the newest quote can be hours old.
    """
    after = _newest_quote_time()
    utc_now = int(time.time())
    if before is None or after is None or after <= before:
        return None, utc_now
    return after, utc_now


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


# ─── POST /diagnose ───────────────────────────────────────────────────────────

DIAGNOSE_ATTEMPTS = 2


@app.post("/diagnose", dependencies=[Depends(verify_secret)])
def diagnose(req: DiagnoseRequest) -> dict:
    """
    Support tool: try this exact login now and say precisely what happens.
    Always forces a fresh login (no "already connected" shortcut) so the answer
    reflects these credentials. Never echoes the password.
    """
    log.info(f"[diagnose] login={req.login} server={req.server}")
    started = time.monotonic()
    with _lock:
        report: dict = {
            "login": req.login,
            "server": req.server,
            "terminal": {
                "path": settings.terminal_path,
                "process_running": _terminal_process_running(),
                "last_ok_login_s_ago": None if _last_ok_age_s() is None else int(_last_ok_age_s()),
            },
        }
        try:
            mt5.shutdown()
        except Exception:
            pass
        failures = _try_login(req.login, req.password, req.server, DIAGNOSE_ATTEMPTS)
        report["login_attempts"] = [_mt5_error(*(tuple(f) + (None, None))[:2]) for f in failures]

        if failures:
            status, detail = _failure_detail(req.login, req.server, failures)
            report.update(ok=False, http_status=status, verdict=detail["code"], reason=detail["reason"], explanation=detail["message"])
            report["terminal"] = detail["terminal"]
        else:
            info = mt5.account_info()
            term = mt5.terminal_info()
            report["account"] = None if info is None else {
                "login": info.login, "server": info.server, "name": info.name, "company": info.company,
                "currency": info.currency, "balance": str(info.balance), "equity": str(info.equity),
                "leverage": info.leverage, "margin_mode": _margin_mode(info.margin_mode),
                "trade_mode": info.trade_mode, "investor_login": not bool(getattr(info, "trade_allowed", False)),
            }
            report["terminal"].update({
                "build": getattr(term, "build", None),
                "connected_to_broker": bool(getattr(term, "connected", False)),
                "ping_ms": round(getattr(term, "ping_last", 0) / 1000, 1) if term else None,
                "company": getattr(term, "company", None),
            })
            now = datetime.now(timezone.utc)
            try:
                frm = datetime(now.year - 1, now.month, 1)
                report["history"] = {
                    "deals_last_12_months": mt5.history_deals_total(frm, now.replace(tzinfo=None)),
                    "orders_last_12_months": mt5.history_orders_total(frm, now.replace(tzinfo=None)),
                }
            except Exception as e:  # history is informative only
                report["history"] = {"error": str(e)}
            before = _newest_quote_time()
            time.sleep(1)
            server_time, utc_now = _live_server_time(before)
            report["server_clock"] = {
                "newest_quote_time": _newest_quote_time(),
                "utc_now": utc_now,
                "offset_hours": None if server_time is None else round((server_time - utc_now) / 3600, 2),
                "live": server_time is not None,
            }
            ok_server = info is not None and info.server == req.server
            report.update(
                ok=True, http_status=200, verdict="OK", reason="LOGGED_IN",
                explanation=(f"Signed in to {req.login}@{req.server} fine."
                             + ("" if ok_server or info is None else f" Note: MT5 reports the server as '{info.server}', not '{req.server}'.")),
            )
        report["took_ms"] = int((time.monotonic() - started) * 1000)
        log.info(f"[diagnose] {req.login}@{req.server}: {report['verdict']}/{report['reason']} in {report['took_ms']} ms")
        return report


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
        quote_before = _newest_quote_time()
        mt5.history_orders_get(req.from_time, req.to_time)
        time.sleep(1)
        raw = mt5.history_deals_get(req.from_time, req.to_time)
        server_time, utc_now = _live_server_time(quote_before)
        if raw is None:
            log.warning(f"[deals] history_deals_get returned None: {mt5.last_error()}")
            return DealsResponse(deals=[], total=0, server_time=server_time, utc_now=utc_now)
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
        if server_time is not None:
            log.info(f"[deals] server clock offset ~{(server_time - utc_now) / 3600:+.2f}h")
        return DealsResponse(deals=result, total=len(result), server_time=server_time, utc_now=utc_now)


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


# ─── POST /candles ──────────────────────────────────────────────────────────

# Our timeframe tokens → MT5 timeframe constants.
TF_MAP = {
    "1m": mt5.TIMEFRAME_M1,
    "5m": mt5.TIMEFRAME_M5,
    "15m": mt5.TIMEFRAME_M15,
    "30m": mt5.TIMEFRAME_M30,
    "1h": mt5.TIMEFRAME_H1,
    "4h": mt5.TIMEFRAME_H4,
    "1d": mt5.TIMEFRAME_D1,
    "1w": mt5.TIMEFRAME_W1,
    "1M": mt5.TIMEFRAME_MN1,
}

# Default bar count when neither `count` nor a `from_time` range is supplied.
DEFAULT_CANDLE_COUNT = 500


@app.post("/candles", response_model=CandlesResponse, dependencies=[Depends(verify_secret)])
def candles(req: CandlesRequest) -> CandlesResponse:
    log.info(f"[candles] login={req.login} symbol={req.symbol} tf={req.timeframe} count={req.count}")
    tf = TF_MAP.get(req.timeframe)
    if tf is None:
        # Unknown timeframe token — behave like "no data" rather than 500ing.
        log.warning(f"[candles] unknown timeframe {req.timeframe!r}")
        return CandlesResponse(candles=[], total=0)
    with _lock:
        _connect(req.login, req.password, req.server)
        # Ensure the symbol is selected in Market Watch; a symbol that has never
        # been selected may have no series cached until it is. Best-effort.
        if not mt5.symbol_select(req.symbol, True):
            log.warning(f"[candles] symbol_select({req.symbol}) failed: {_last_error()}")
        # Warm-up: nudge the terminal to pull the series before the real request —
        # brokers lazily download deep history on first access.
        mt5.copy_rates_from_pos(req.symbol, tf, 0, 1)

        if req.count:
            rates = mt5.copy_rates_from_pos(req.symbol, tf, 0, req.count)
        elif req.from_time:
            to_time = req.to_time or datetime.now(timezone.utc)
            rates = mt5.copy_rates_range(req.symbol, tf, req.from_time, to_time)
        else:
            rates = mt5.copy_rates_from_pos(req.symbol, tf, 0, DEFAULT_CANDLE_COUNT)

        if rates is None or len(rates) == 0:
            log.warning(f"[candles] no rates for {req.symbol} {req.timeframe}: {_last_error()}")
            return CandlesResponse(candles=[], total=0)

        result: list[Candle] = [
            Candle(
                time=int(r["time"]),
                open=str(r["open"]),
                high=str(r["high"]),
                low=str(r["low"]),
                close=str(r["close"]),
                volume=str(r["tick_volume"]),
                spread=int(r["spread"]),
            )
            for r in rates
        ]
        log.info(f"[candles] pulled {len(result)} bars for {req.symbol} {req.timeframe}")
        return CandlesResponse(candles=result, total=len(result))
