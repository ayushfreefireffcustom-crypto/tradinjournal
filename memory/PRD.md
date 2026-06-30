# TradinX — Trade Journal (Frontend Redesign)

## Original problem statement
> "start working on the frontend portion of my github repo tradinjournal https://github.com/ayushfreefireffcustom-crypto/tradinjournal/tree/main — this is the link i have imported my github"

User choices (Jan 2026):
- Full redesign of the frontend
- Wire-up to real backend (deferred: backend services not running in this preview)
- Run Next.js on port 3000 only
- Priority pages: **Landing**, **Dashboard**, **Analytics**, **Chart Replay**

## Architecture
- **Monorepo (existing)**: pnpm/turbo workspace with `apps/{api,worker,mt5-bridge,web}` + `packages/{core,db,contracts,types,config,logger,queue}`
- **Active app**: `apps/web` (Next.js 15 + React 19 + Tailwind v4)
- **Supervisor wrapper**: `/app/frontend/package.json` exposes `yarn start` → runs `next dev -p 3000` from `/app/apps/web`
- **Mock data layer**: Routes at `/data/*` (not `/api/*` because Emergent ingress reserves `/api/*` for FastAPI on port 8001)
  - `GET /data/accounts`, `POST /data/accounts`
  - `GET /data/trades`, `GET /data/trades/stats`, `GET /data/trades/deals`
- **Design**: "Tactical Swiss Terminal" — pure obsidian background (#0A0A0A), 1px borders, Cabinet Grotesk (display) + JetBrains Mono (data)

## Implemented (2026-01-30)
- Redesigned landing page (`/`): hero with synthetic candle terminal, ticker tape, capability bento grid, analytics preview, pricing, FAQ, CTA
- Redesigned dashboard (`/dashboard`): account switcher, KPI tiles (Win Rate, PF, Max DD, Behavioural Score), live equity curve, psych signals panel, day-of-week bars, recent fills, performance-by-symbol table
- Redesigned analytics (`/analytics`): KPI row, win/loss donut, day-of-week distribution, R-multiple histogram, session × day heatmap, equity curve, instrument breakdown table
- Redesigned chart replay (`/journal`): position log left, candlestick chart with entry/exit markers center, journal/emotion/tags panel right, replay controls
- Redesigned trade log (`/trades`): position table + raw deals tab with LONG/SHORT/WIN/LOSS filters
- Redesigned login (`/login`) & signup (`/signup`): split layout, demo-mode auth, deep-links into dashboard
- Mock data layer with deterministic seeded data (78 trades for XM account, 42 for IC Markets) — equity curves, R-multiples, win rates, etc.
- All pages annotated with `data-testid` for downstream testing

## Tech notes
- **Tailwind v4** with `@theme` in `globals.css` (no `tailwind.config.ts` required)
- Custom palette: `--color-app`, `--color-surface`, `--color-fg`, `--color-profit` (#00C566), `--color-loss` (#FF3B30), `--color-warning` (#FF9F0A)
- Fonts loaded from Fontshare (Cabinet Grotesk) + Google (JetBrains Mono)
- `allowedDevOrigins` is wildcarded for Emergent preview hosts in `next.config.ts`
- `better-auth` was removed; auth is fully mocked client-side in `src/lib/auth-client.ts` (deferred until real backend is wired)

## Backlog
- P1: wire the frontend to the real Express API (`apps/api`) and MT5 bridge (`apps/mt5-bridge`) instead of `/data/*` mocks
- P1: real MT5 broker-connection flow (currently the modal "succeeds" instantly with a fake account)
- P1: real auth (better-auth) when backend is reachable
- P2: trade detail / single-position page
- P2: persistent journal entries (currently in-memory only)
- P2: CSV / JSON export from analytics page
- P2: drawdown underwater curve as a dedicated chart
- P3: mobile-optimised layouts (currently desktop-first)

## Next action items
1. Stand up `apps/api` + Postgres + Redis (locally or via docker compose) so the frontend can read real MT5 trades.
2. Replace mock `auth-client.ts` with real `better-auth` once the API is reachable.
3. Hook the broker-connection modal to the real `POST /api/accounts` endpoint.
