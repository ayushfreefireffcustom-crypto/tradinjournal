# mt5-bridge

A small **Python + FastAPI** service that wraps the official `MetaTrader5` library and exposes it
over HTTP for the Node backend. It is the **`SelfHostedMt5Connector`** behind the Node
`BrokerConnector` interface.

- **Read-only.** Uses the investor (read-only) password; it can read history & positions but can
  never trade or withdraw.
- **Windows-only.** The `MetaTrader5` library requires a Windows host with the MT5 terminal running.
- **Authenticated.** Calls from Node carry a shared-secret header; the service is never public.

## Run

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

## Endpoints

| Method | Path        | Purpose                                  |
| ------ | ----------- | ---------------------------------------- |
| POST   | `/verify`   | Check login works; return mode/currency  |
| POST   | `/account`  | Account info (balance, equity, currency) |
| POST   | `/deals`    | History deals between two timestamps     |
| POST   | `/positions`| Current open positions                   |
| POST   | `/candles`  | OHLC bars for a symbol + timeframe       |

### Stop loss / take profit (optional fields)

- `/positions`: each position also has `sl`, `tp` (decimal strings, `null` when
  not set) and `update_time` (Unix seconds of the last modification).
- `/deals`: opening deals (`entry` 0) also have `sl` / `tp` from the order that
  opened the position (`history_orders_get`); every other deal sends `null`.

All of them are optional. The API (`apps/api/src/modules/sync`) works with a
bridge that doesn't send them; when they are present it stores them as
`trade_level` rows so R-multiples and stop moves show in the journal.

## Tests

The tests replace the Windows-only `MetaTrader5` package with a fake module, so
they run on any OS:

```bash
pip install -e ".[dev]"   # or: pip install -r requirements.txt pytest httpx
pytest
```

## Redeploy (Windows host)

The bridge runs on the Windows box next to the MT5 terminal; it isn't deployed
by CI. To ship a change:

1. RDP into the host and stop the running bridge (close its console, or
   `Stop-Service mt5-bridge` / `nssm stop mt5-bridge` if it runs as a service).
2. Pull the repo (or copy `apps/mt5-bridge/app/*` over the old files).
3. In `apps/mt5-bridge`: `.venv\Scripts\activate` then
   `pip install -r requirements.txt` (no new packages for the sl/tp change).
4. Start it again: `uvicorn app.main:app --host 0.0.0.0 --port 8000` (or start the
   service). Keep the same `.env` (`MT5_BRIDGE_SHARED_SECRET`, `MT5_BRIDGE_TERMINAL_PATH`).
5. Check: `GET /health` returns `"terminal": true`, then a `/positions` call for a
   known account shows `sl` / `tp` keys. The API picks the new fields up on its
   next sync; nothing to change on the API side.

Rolling back is the same steps with the old files: the API ignores missing fields.
