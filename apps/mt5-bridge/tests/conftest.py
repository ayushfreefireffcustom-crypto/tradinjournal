"""The MetaTrader5 package only exists on Windows. Tests swap in a small fake
module before app.main is imported, so the endpoints run anywhere."""

import sys
import types
from types import SimpleNamespace

import pytest

fake = types.ModuleType("MetaTrader5")
for i, name in enumerate(["M1", "M5", "M15", "M30", "H1", "H4", "D1", "W1", "MN1"]):
    setattr(fake, f"TIMEFRAME_{name}", i)
fake.state = SimpleNamespace(positions=[], deals=[], orders=[], login=1)
fake.initialize = lambda *a, **k: True
fake.shutdown = lambda: None
fake.login = lambda *a, **k: True
fake.last_error = lambda: (1, "ok")
fake.terminal_info = lambda: SimpleNamespace(connected=True, build=1, path="x")
fake.account_info = lambda: SimpleNamespace(login=fake.state.login)
fake.positions_get = lambda: fake.state.positions
fake.history_deals_get = lambda *a: fake.state.deals
fake.history_orders_get = lambda *a: fake.state.orders
sys.modules["MetaTrader5"] = fake


@pytest.fixture()
def mt5():
    fake.state.positions, fake.state.deals, fake.state.orders = [], [], []
    return fake


@pytest.fixture()
def client(monkeypatch):
    from fastapi.testclient import TestClient
    import app.main as main

    monkeypatch.setattr(main.time, "sleep", lambda s: None)
    monkeypatch.setattr(main.settings, "shared_secret", "test-secret")
    with TestClient(main.app) as c:
        c.headers.update({"X-Bridge-Secret": "test-secret"})
        yield c
