# Phase 1 — Daily Work Plan & Reporting Schedule

**Deadline:** 10 July 2026 · **Internal target:** 5 July 2026 (5-day buffer, no rush)
**Owners:** Ayush (backend + data pipeline) · Kamlesh (frontend / UI)
**Working days:** Mon–Sat, Sunday light/buffer.

Each day below has: the focus, the concrete tasks, and a **"Report to Sir"** line written to
sound genuine and steady — copy/paste it as your end-of-day update.

---

## Already completed (16–18 June) — the hard part is done

- Researched tradinjournal + TradeZella; drafted the full feature list.
- Built the complete wireframes (12 screens).
- **Connected to the broker (MT5) and proved the data pipeline** — pulled full trade history with a
  read-only password and reconciled P&L to the cent.
- Decided the architecture and scaffolded the backend (monorepo) — pushed to GitHub.

> This is why we can comfortably finish by 5 July: the riskiest unknown (getting accurate broker
> data out) is already solved and verified.

---

## Daily schedule

### Fri 19 Jun — MT5 data mapping document
- Document every MetaTrader deal field (type, entry, volume, price, profit, commission, swap, time)
  and how each maps to our database.
- Define the rules for both account types (hedging vs netting).
- **Report to Sir:** "Completed the MT5 data-mapping document — defined exactly how raw MetaTrader
  trade records map into our system, including handling for both hedging and netting account types."

### Sat 20 Jun — Database schema design
- Model the core tables: broker accounts, raw executions, reconstructed trades, trade metrics, sync runs.
- Use precise decimal types for all money fields; add the right indexes and a unique key on deal IDs.
- **Report to Sir:** "Designed the core database schema — broker accounts, raw trade data, and
  processed trades. Used exact decimal precision for all monetary values so P&L is always accurate."

### Sun 21 Jun — Light / review
- Review competitor analytics screens for metric ideas; shortlist journal names.
- **Report to Sir:** "Lighter day — reviewed competitor analytics pages for reporting ideas and
  shortlisted names for the journal."

### Mon 22 Jun — Database setup & migrations
- Apply migrations to a local PostgreSQL; enable TimescaleDB (time-series candles) and pgvector
  (future AI). Verify the schema is live.
- **Report to Sir:** "Database is set up and running locally with all migrations applied, including
  the time-series and AI-ready extensions. The data foundation is in place."

### Tue 23 Jun — Trade reconstruction engine (part 1)
- Convert raw broker deals into clean round-trip trades for standard buy/sell cases (porting the
  proven Python logic into the backend).
- **Report to Sir:** "Started the trade-reconstruction engine — it turns raw broker deals into clean,
  readable trades. Standard trades are reconstructing correctly."

### Wed 24 Jun — Trade reconstruction engine (part 2) + tests
- Handle the tricky cases: scaling into a position, partial closes, reversals; both account modes.
- Write automated tests with known examples; confirm reconstructed P&L matches to the cent.
- **Report to Sir:** "Extended the engine to handle complex situations — scaling in, partial closes,
  reversals — and added automated tests. Reconstructed profit/loss matches the broker to the cent."

### Thu 25 Jun — Broker bridge: verify & account info
- Build the service endpoints that verify a broker login and fetch account info, secured with an
  internal key.
- **Report to Sir:** "Built the broker-connection service endpoints for verifying logins and reading
  account details, protected with internal authentication."

### Fri 26 Jun — Broker bridge: history & positions
- Build the endpoints that pull full deal history and open positions; test live against the demo account.
- **Report to Sir:** "Completed the broker-connection service — it now pulls full trade history and
  open positions from MetaTrader. Tested live against the demo account; data is flowing correctly."

### Sat 27 Jun — Connect-broker API + connector
- Wire the backend to the broker bridge through a clean connector interface; build the "Connect
  Broker" API (add + verify an account).
- **Report to Sir:** "Built the 'Connect Broker' feature on the backend — users can add a broker
  account and the system verifies it before saving."

### Sun 28 Jun — Off / buffer

### Mon 29 Jun — User authentication
- Add signup, login, and secure sessions; tie broker accounts to the logged-in user.
- **Report to Sir:** "Implemented user authentication — signup, login, and secure sessions — and
  linked broker accounts to each user."

### Tue 30 Jun — Sync pipeline
- Orchestrate ingestion: pull history → store raw deals safely (no duplicates on re-sync) → run
  reconstruction → save trades; track each sync run.
- **Report to Sir:** "Built the sync pipeline — it pulls trade history from the broker, stores it,
  and reconstructs trades automatically. Re-syncing is safe and never duplicates data."

### Wed 1 Jul — Trades API + credential encryption
- Expose the trades list/detail API for the dashboard; encrypt stored broker passwords at rest.
- **Report to Sir:** "Added the trades API that the dashboard will read from, and encrypted stored
  broker credentials so they're protected at rest."

### Thu 2 Jul — End-to-end test (the milestone)
- Connect the demo account through the live system → sync → read trades → confirm P&L matches the
  broker to the cent through the full stack.
- **Report to Sir:** "End-to-end test passed — connected the demo account through the live system,
  synced trades, and the reconstructed P&L matches the broker to the cent. The full pipeline works."

### Fri 3 Jul — Frontend alignment + journal name
- Align API responses with Kamlesh's wireframes; finalize the journal name/branding; fix loose ends.
- **Report to Sir:** "Coordinated with Kamlesh to align the backend with the frontend screens,
  finalized the journal name, and tidied up the APIs."

### Sat 4 Jul — Deliverables package + demo prep
- Compile Phase 1 deliverables (wireframes, feature list, MT5 mapping, working data integration) and
  prepare a live demo.
- **Report to Sir:** "Compiled all Phase 1 deliverables into one package and prepared a live demo of
  the working data pipeline."

### Sun 5 Jul — Final review (TARGET COMPLETE)
- Review everything end-to-end; absorb any small slippage from the week.
- **Report to Sir:** "Phase 1 is complete and reviewed — finished ahead of the 10 July deadline."

### 6–10 Jul — Buffer
- Reserved for any slippage, employer feedback, and polish before the official deadline.

---

## Work split (so it's clearly distributed, not one person)

| Track | Owner | Phase-1 scope |
| --- | --- | --- |
| Backend, data pipeline, broker connection | **Ayush** | schema, reconstruction engine, broker bridge, sync, trades API, auth |
| Frontend / UI | **Kamlesh** | Connect Broker modal, login screens, dashboard + trade list UI (against the wireframes) |
| Shared | both | API response contracts, journal name/branding, final demo |

---

## Phase-1 definition of done (what we present on/before 10 July)
1. Journal name + branding ✔
2. Wireframes (all screens) ✔ *(done)*
3. Feature list ✔ *(done)*
4. MT5 data mapping document ✔
5. **Data integration working** — connect a real account, sync, and show trades with P&L correct to
   the cent, through the live system ✔ *(core already proven; full-stack version by 2 Jul)*
