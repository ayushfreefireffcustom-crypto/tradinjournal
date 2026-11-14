from types import SimpleNamespace as NS

from app.levels import level_or_none, order_levels

CREDS = {"login": 1, "password": "p", "server": "S"}


def test_level_or_none_treats_zero_as_unset():
    assert level_or_none(0.0) is None
    assert level_or_none(None) is None
    assert level_or_none(float("nan")) is None
    assert level_or_none(1.0812) == "1.0812"


def test_order_levels_keeps_orders_with_a_level():
    out = order_levels([NS(ticket=1, sl=1.05, tp=0.0), NS(ticket=2, sl=0.0, tp=0.0), NS(ticket=3, sl=0.0, tp=2.5)])
    assert out == {1: ("1.05", None), 3: (None, "2.5")}
    assert order_levels(None) == {}


def test_positions_return_sl_tp_and_update_time(client, mt5):
    mt5.state.positions = [
        NS(ticket=7, symbol="EURUSD", type=0, volume=0.1, price_open=1.08, price_current=1.081, profit=10.0,
           commission=0.0, swap=0.0, time=1700000000, sl=1.075, tp=0.0, time_update=1700000300),
    ]
    r = client.post("/positions", json=CREDS)
    assert r.status_code == 200
    p = r.json()["positions"][0]
    assert p["sl"] == "1.075" and p["tp"] is None and p["update_time"] == 1700000300
    # Old fields unchanged.
    assert p["position_id"] == 7 and p["price_open"] == "1.08"


def test_deals_carry_the_opening_orders_levels(client, mt5):
    deal = dict(symbol="EURUSD", type=0, volume=0.1, price=1.08, profit=0.0, commission=0.0, swap=0.0, fee=0.0,
                time=1700000000, magic=0, comment="", reason=0, position_id=7)
    mt5.state.orders = [NS(ticket=70, sl=1.075, tp=1.09), NS(ticket=71, sl=0.0, tp=0.0)]
    mt5.state.deals = [NS(ticket=1, order=70, entry=0, **deal), NS(ticket=2, order=71, entry=1, **deal)]
    r = client.post("/deals", json={**CREDS, "from_time": "2023-01-01T00:00:00", "to_time": "2024-01-01T00:00:00"})
    assert r.status_code == 200
    d_in, d_out = r.json()["deals"]
    assert (d_in["sl"], d_in["tp"]) == ("1.075", "1.09")
    assert (d_out["sl"], d_out["tp"]) == (None, None)


def test_rejects_wrong_secret(client):
    r = client.post("/positions", json=CREDS, headers={"X-Bridge-Secret": "nope"})
    assert r.status_code == 401
