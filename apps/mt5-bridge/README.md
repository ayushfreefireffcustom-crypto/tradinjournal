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

## Planned endpoints

| Method | Path        | Purpose                                  |
| ------ | ----------- | ---------------------------------------- |
| POST   | `/verify`   | Check login works; return mode/currency  |
| POST   | `/account`  | Account info (balance, equity, currency) |
| POST   | `/deals`    | History deals between two timestamps     |
| POST   | `/positions`| Current open positions                   |
