"""
MT5 bridge (FastAPI) — read-only connector to MetaTrader 5.

Wraps the official `MetaTrader5` Python library and exposes it over HTTP so the
Node backend can call it. Endpoints (verify / account / deals / positions) are
added as the BrokerConnector is built. This service ONLY ever reads — it uses
the investor (read-only) password and never places trades.

Run (Windows, MT5 terminal installed):
    uvicorn app.main:app --host 0.0.0.0 --port 8000
"""

from fastapi import FastAPI

app = FastAPI(title="MT5 Bridge", version="0.0.0")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "mt5-bridge"}


# TODO: POST /verify, POST /account, POST /deals, POST /positions
