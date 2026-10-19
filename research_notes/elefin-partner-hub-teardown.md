# Elefin partner hub — teardown (2026-10-19)

Source: the publicly served JS bundle of partners.elefin.com (Laravel + Inertia + React).
48 page chunks (partner portal + admin "partner-hub") downloaded and parsed with REA
(`analyze_javascript_application`, evidence `ev_bcdf2a7f…8966`, 48/48 files parsed, no
execution). No login, no API calls. Everything below is **observed in shipped UI code**
(route strings, prop names, UI copy) unless marked *inferred*.

## Pages

Partner portal (`/partner/*`): dashboard, clients, accounts (client trading accounts),
commissions, codes (`/partner/codes/{id}`), wallet, rewards, resources (banners, social, docs).

Admin (`/admin/partner-hub/*`): dashboard, partners (index/show/create), programs, tiers,
tier-upgrades, change-requests, quick-actions, loyalty, symbol-rates, wallets, bbook,
reports (commissions, coverage, leaderboard, partner-performance), resources,
settings (general, codes, document-links, staff, teams/roles).

## Attribution rules (the part TRADElogs copies)

- A partner holds **several codes**: one generated primary (`is_primary`) plus custom
  "vanity" codes. "Every code below points at you and pays the same."
- Custom code format: **3–20 letters, numbers, hyphens or underscores**; first come, first
  served; partner can release it. Cap: `max_links_per_partner` (admin setting).
- Admin **reserved names**: "Route names a code would shadow, and words that would let a
  partner pass their link off as ours. These cannot be released." Admin can revoke a
  partner's custom code (it becomes bookable again).
- A visitor is attributed **by link (cookie) or by typing the code at signup**.
  `referral_cookie_days` is an admin setting ("How long a referral cookie lasts").
- Clicks are tracked per link ("Tracked — clicks on this are counted below"), with a
  recent-clicks list and click → client conversion.
- Clients are listed with name, client ref, country, `registered_at`, lots traded.

## Admin controls (non-money)

- Partner lifecycle: **pending → active**, **suspend** (portal + accrual stop),
  **reinstate**, **revoke** = demote to client-only, links deactivated, record hidden
  ("Blocked if they have active downline or a non-zero balance").
- **Lookup referrer**: "Find which partner referred a user. Search by their email, or by
  any partner code."
- **Assign client**: attach an existing user to a partner manually.
- **Unlink client**: "Past commissions are kept. The partner stops earning on this
  client's future trades."
- **Move all clients** from partner A to partner B (summary shown before moving).
- **Change requests**: a client asks to switch partner from the support drawer; admin
  approves ("Trades from now on are credited to the new partner … not a clawback") or
  rejects (client keeps partner, is emailed, can apply again). Partners can be
  **force-locked** (`clients_locked`) so their clients are never offered the option.
- **Notes** on every partner ("Context for whoever picks this up next"); every action
  takes an optional reason "written to admin notes". Impersonate URL exists.
- Self-service partner signup can be switched on (`show_become_partner`).

## Money side (not built in TRADElogs yet — reference only)

Programs → tiers (`standard_pct`, `pro_pct`, `min_active_traders`, `min_volume_usd`),
tier upgrades raised for review ("never applies on its own"), per-symbol commission
rates, IB wallet + ledger (credit/debit/hold released/withdrawal requested/rejected/
completed), withdrawal limits (min, max, daily, cooldown, max pending),
`min_position_holding_seconds` (anti-scalp), `min_commission_amount`, B-book revenue share,
loyalty prizes by lifetime volume.

## What TRADElogs takes (tracking only)

Multi-code partners with reserved names and a link cap; configurable cookie window;
per-link click tracking; attribution locked at signup (link or typed code); partner
lifecycle (pending/active/suspended/revoked); admin lookup / assign / unlink / move-all;
notes + reasons as an audit trail. "Active trader" = our existing activity rule instead of
lots/volume. Change requests and force-lock: later.
