# MT5 Data Mapping — Raw Deals → Database

This document defines every MetaTrader 5 deal field, what it means, how it maps to our
`Execution` table, and the rules for turning raw deals into reconstructed `Trade` rows.

---

## 1. What is a "deal" in MT5?

When you open or close a position, MT5 creates one or more **deals**. A deal is a single
fill event — one line of execution history. A complete round-trip trade (open → close) is
made of **at least two deals**: one entry deal and one exit deal.

Think of it like this:
```
Open position  → deal (entry IN)      ticket=100001
Close position → deal (entry OUT)     ticket=100002
```
Our job is to group these deals into clean `Trade` rows.

---

## 2. MT5 deal fields → Execution table columns

| MT5 field | Python type | DB column | DB type | Notes |
|---|---|---|---|---|
| `ticket` | int | `dealTicket` | `BigInt UNIQUE` | Primary identifier; unique per deal. Used for idempotent upsert — re-syncing never creates duplicates. |
| `order` | int | `orderTicket` | `BigInt` | The order that generated this deal. One order can create one deal (usually). |
| `position_id` | int | `positionId` | `BigInt` | Groups all deals that belong to the same position. Critical for reconstruction in both netting and hedging modes. |
| `time` | int (Unix s) | `dealTime` | `DateTime` | Execution timestamp in UTC seconds. Convert: `new Date(time * 1000)`. |
| `time_msc` | int (Unix ms) | `dealTimeMsc` | `BigInt` | Millisecond precision. Store for ordering within the same second. |
| `type` | int | `type` | `Enum DealType` | See deal types below. Only `BUY` and `SELL` are actual trades; others are account events. |
| `entry` | int | `entry` | `Enum DealEntry` | Direction of this fill: opening, closing, or both. See deal entries below. |
| `symbol` | str | `symbol` | `String` | Trading instrument, e.g. `EURUSD`, `XAUUSD`. Empty string for balance/deposit deals. |
| `volume` | float | `volume` | `Decimal` | Lot size traded. Use `Decimal` — floats corrupt small lot sizes. |
| `price` | float | `price` | `Decimal` | Fill price. |
| `commission` | float | `commission` | `Decimal` | Broker commission for this fill. Usually negative (cost). |
| `swap` | float | `swap` | `Decimal` | Overnight swap cost/credit. Non-zero only when a position is held past rollover. |
| `profit` | float | `profit` | `Decimal` | Gross P&L contribution of this deal. Positive = gain, negative = loss. For entry deals this is always 0.00. For exit deals this is the realised P&L. |
| `fee` | float | `fee` | `Decimal` | Additional fees (exchange fees, etc). May be 0 for retail brokers. |
| `magic` | int | `magic` | `Int` | EA (robot) identifier. 0 = manual trade. Useful for filtering robot trades. |
| `comment` | str | `comment` | `String?` | Free-text comment from trader or EA. |
| `reason` | int | `reason` | `Enum DealReason` | Why the deal happened (SL hit, TP hit, manual, EA, etc). See below. |
| `external_id` | str | `externalId` | `String?` | Exchange-assigned ID. Rarely populated for retail. |

### Money precision rule
**Never use `Float` for any monetary column.** Use `Decimal` (Postgres `NUMERIC(18,8)`) end-to-end.
MT5 returns Python `float` — convert to string then to `Decimal` before any arithmetic to avoid
`1.3424800000000001`-style corruption.

---

## 3. Deal type enum (`DEAL_TYPE`)

| MT5 constant | Value | Meaning | Action |
|---|---|---|---|
| `DEAL_TYPE_BUY` | 0 | Bought (long entry or short exit) | Trade deal — include in reconstruction |
| `DEAL_TYPE_SELL` | 1 | Sold (short entry or long exit) | Trade deal — include in reconstruction |
| `DEAL_TYPE_BALANCE` | 2 | Deposit or withdrawal | Account event — separate from trades; use for reconciliation |
| `DEAL_TYPE_CREDIT` | 3 | Credit / bonus | Skip (non-cash) |
| `DEAL_TYPE_CHARGE` | 4 | Charge | Skip |
| `DEAL_TYPE_CORRECTION` | 5 | Balance correction | Treat like BALANCE |
| `DEAL_TYPE_COMMISSION` | 7 | Commission deduction | Usually rolled into deal commission; skip as standalone |
| `DEAL_TYPE_INTEREST` | 11 | Interest credit | Skip |
| `DEAL_TYPE_DIVIDEND` | 14 | Dividend | Skip |
| `DEAL_TYPE_TAX` | 16 | Tax | Skip |

**Rule:** only `DEAL_TYPE_BUY` and `DEAL_TYPE_SELL` go into `Execution` rows.
`DEAL_TYPE_BALANCE` (and CORRECTION) goes into a separate `BalanceEvent` table for reconciliation.
Everything else is ignored.

---

## 4. Deal entry enum (`DEAL_ENTRY`)

| MT5 constant | Value | Meaning |
|---|---|---|
| `DEAL_ENTRY_IN` | 0 | Opening a position (entry fill) |
| `DEAL_ENTRY_OUT` | 1 | Closing a position (exit fill) — this deal carries the P&L |
| `DEAL_ENTRY_INOUT` | 2 | Simultaneous open+close (reversal in one deal) |
| `DEAL_ENTRY_OUT_BY` | 3 | Closed by an opposite position (hedging mode only) |

---

## 5. Deal reason enum (`DEAL_REASON`)

| Value | Meaning | Use |
|---|---|---|
| 0 | Manual (client) | |
| 1 | Mobile app | |
| 2 | Web terminal | |
| 3 | Expert Advisor | Filter by `magic` if needed |
| 4 | Stop Loss hit | Tag trade with `exitReason: SL` |
| 5 | Take Profit hit | Tag trade with `exitReason: TP` |
| 6 | Stop Out (margin call) | Tag trade with `exitReason: STOP_OUT` |
| 7 | Rollover | |
| 9 | Stock split | |

---

## 6. Account modes: netting vs hedging

MT5 supports two position-management modes. We detect this at account-connection time
(`account_info().margin_mode`) and store it on `BrokerAccount.marginMode`.

### Netting mode (`ACCOUNT_MARGIN_MODE_RETAIL_NETTING`)

- Only **one** position per symbol at a time.
- All deals on the same symbol share a **single** `position_id`.
- Scale-in (add to position) = multiple `ENTRY_IN` deals on the same `position_id`.
- Partial close = `ENTRY_OUT` deal with volume < current position volume.
- Full close = `ENTRY_OUT` deal with volume = remaining position volume.
- `profit` is only non-zero on `ENTRY_OUT` deals.

**Reconstruction rule (netting):**
```
Group deals by position_id.
Trade.openTime  = min(dealTime of all ENTRY_IN deals)
Trade.closeTime = max(dealTime of all ENTRY_OUT deals)  [null if still open]
Trade.symbol    = symbol
Trade.side      = BUY if first ENTRY_IN is DEAL_TYPE_BUY, else SELL
Trade.volume    = sum of ENTRY_IN volumes  (= max open exposure)
Trade.avgEntry  = weighted average price of ENTRY_IN deals
Trade.avgExit   = weighted average price of ENTRY_OUT deals
Trade.grossPnl  = sum of profit across all ENTRY_OUT deals
Trade.commission= sum of commission across all deals in group
Trade.swap      = sum of swap across all deals in group
Trade.netPnl    = grossPnl + commission + swap
```

### Hedging mode (`ACCOUNT_MARGIN_MODE_RETAIL_HEDGING`)

- **Multiple** open positions per symbol allowed.
- Each open gives a distinct `position_id`.
- A single `position_id` maps to exactly one round-trip trade (open + close).
- `ENTRY_OUT_BY` deals close a position using an opposite-side position.

**Reconstruction rule (hedging):**
```
Group deals by position_id.  (Same as netting, but each group = one clean trade.)
Same aggregation as above — simpler because no cross-symbol netting.
```

---

## 7. Scale-in / partial close examples

### Scale-in (netting)
```
deal 1: ENTRY_IN  BUY  0.50 lots @ 1.1000   profit=0.00
deal 2: ENTRY_IN  BUY  0.25 lots @ 1.1020   profit=0.00
deal 3: ENTRY_OUT SELL 0.75 lots @ 1.1050   profit=+37.50

→ Trade: side=BUY, volume=0.75, avgEntry=1.1007, avgExit=1.1050, grossPnl=+37.50
```

### Partial close (netting)
```
deal 1: ENTRY_IN  BUY  1.00 lots @ 1.1000   profit=0.00
deal 2: ENTRY_OUT SELL 0.50 lots @ 1.1040   profit=+20.00   ← partial
deal 3: ENTRY_OUT SELL 0.50 lots @ 1.1060   profit=+30.00   ← remainder

→ Trade: side=BUY, volume=1.00, avgEntry=1.1000, avgExit=1.1050, grossPnl=+50.00
```

### Reversal (`ENTRY_INOUT`)
```
deal 1: ENTRY_IN   BUY  1.00 lots @ 1.1000   profit=0.00
deal 2: ENTRY_INOUT SELL 2.00 lots @ 1.1020   profit=+20.00
        ↑ closes the 1-lot long AND opens a 1-lot short simultaneously

→ Two trades:
   Trade A: side=BUY,  open=1.1000, close=1.1020, volume=1.00, grossPnl=+20.00
   Trade B: side=SELL, open=1.1020, status=OPEN (1 lot short still open)
```
Reversal detection: `ENTRY_INOUT` deal's volume > current position volume, or explicitly
`DEAL_ENTRY_INOUT`. Split into closing portion + opening portion by remaining position volume.

---

## 8. Balance events → reconciliation

Deposits and withdrawals come through as `DEAL_TYPE_BALANCE` deals.
Store them in a `BalanceEvent` table (separate from `Execution`).

| MT5 field | DB column | Notes |
|---|---|---|
| `ticket` | `ticket` | Unique |
| `time` | `time` | UTC |
| `profit` | `amount` | Positive = deposit, negative = withdrawal |
| `comment` | `comment` | e.g. "Deposit", "Withdrawal" |

**Reconciliation formula (must always hold to the cent):**
```
initialBalance + Σ balanceEvents.amount + Σ trades.netPnl == account.currentBalance
```
This is the CI gate. Any reconstruction change that breaks this equation fails the build.

---

## 9. Fields we do NOT store

| MT5 field | Why skipped |
|---|---|
| `time_msc` | Stored as `dealTimeMsc` only if sub-second ordering is needed; otherwise `dealTime` is enough |
| `magic` | Stored — but not used in Phase 1. Useful for EA-vs-manual split later. |
| `reason` | Stored — used in Phase 2 to tag SL/TP exits automatically. |
| `external_id` | Rarely populated for retail MT5. Store as nullable, ignore if empty. |

---

## 10. Open positions

`mt5.positions_get()` returns currently open positions (not deals). Use these to:
- Show live open trades in the UI before they close.
- Mark `Trade.status = OPEN` for unmatched `ENTRY_IN` groups.

Open position fields of interest: `ticket` (= `position_id`), `symbol`, `type`, `volume`,
`price_open`, `profit`, `commission`, `swap`, `time`.

These are **not** stored as `Execution` rows — they're synthesised into a virtual open `Trade`
at query time, or stored as a snapshot updated each sync.

---

## 11. Full field reference (quick lookup)

```
MT5 Python attr    Our DB column     Type        Phase
─────────────────────────────────────────────────────────
ticket             dealTicket        BigInt UNIQUE  1
order              orderTicket       BigInt         1
position_id        positionId        BigInt         1
time               dealTime          DateTime       1
time_msc           dealTimeMsc       BigInt         2
type               type              Enum           1
entry              entry             Enum           1
symbol             symbol            String         1
volume             volume            Decimal        1
price              price             Decimal        1
commission         commission        Decimal        1
swap               swap              Decimal        1
profit             profit            Decimal        1
fee                fee               Decimal        1
magic              magic             Int            2
comment            comment           String?        2
reason             reason            Enum           2
external_id        externalId        String?        3
```
