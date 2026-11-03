# IB Partner dashboard: build plan (3 Nov 2026)

Source: the boss's "TradeLogs IB Partner and Marketplace Dashboard" doc. Builds on the
referral programme that already exists (apps/api/src/modules/partners, still behind
PARTNER_PROGRAM_ENABLED). This is Phase 1 (the MVP) of that doc.

## Defaults chosen without the boss's answers (all changeable)

| Open question | Default built | Where to change it |
|---|---|---|
| First broker / IB API | Any broker, through a **referred-accounts list**: the partner uploads a CSV, pastes rows, or links a published Google Sheet CSV of the account IDs (and emails) the broker shows under their IB. API adapters plug into the same interface later. | `ib-sources.ts` adapter registry |
| Active trader | At least 1 closed trade in the last 30 days (admin-editable: trades, window, minimum lots) | Admin › Partners › Settings |
| More than one partner per client | No. The first partner keeps the client; the admin can move them | existing |
| What partners see per client | Name, status, trades, volume. **P&L per client only with the client's consent** (toggle on the client's Access page); totals and profitable/losing counts are always shown | Access page |
| Partner tools in the MVP | **Packages** of existing TRADElogs features (catalog), plus the partner's own marketplace strategies marked "my clients only". The admin decides which features are locked to package holders (none by default, so nothing changes for current users) | Admin › Partners › Settings |
| Who pays | Nobody: access is free; no commissions or payouts (Phase 2) | n/a |
| Existing users | Can enter a partner code once on the Access page if they have no partner yet | n/a |
| Several MT5 accounts | One verified account under the partner's IB is enough | eligibility logic |
| Partner suspended | Their clients keep access for the grace period (7 days), then it is suspended | Settings › grace days |
| Account goes inactive or disconnects | Access moves to grace for 7 days, then suspends; it comes back automatically when the account qualifies again | Settings |

## Verification rules (from the doc)
- Ownership = the client connected the MT5 account with a password and the bridge logged in.
- **Auto-verified** only when that account's login appears in the partner's referred-accounts list for the same broker.
- An **email-only match** never verifies by itself: it goes to the admin's manual review queue as a signal.
- Not found: the client sees why and can retry, or ask for a review.
- A pasted API key never grants anything.

## Data model (new)
- Partner: application fields (brokers, socials, audience size, pitch), review note, REJECTED and NEEDS_INFO statuses
- PartnerBroker: a partner's IB connection per broker (method, IB id, sheet URL, encrypted API key slot, health, last sync, error)
- IbAccount: an account the broker reports under that IB (account id, email)
- ClientVerification: one per connected broker account (status, method, matched IB row, reason, review)
- PartnerPackage: features + partner-only strategies + eligible brokers + requires-active + access days
- ClientEntitlement: a client's access to a package (ACTIVE / GRACE / SUSPENDED / EXPIRED, with dates and reason)
- PartnerEvent: audit trail of sync runs, verifications, access changes and consent
- Referral gains P&L snapshot fields and statsConsentAt
- Programme settings live in SystemSetting key `partner.program`

## Screens
- Trader: **Access** page (my partner, broker accounts and their verification, active status, unlocked features, locked reasons, consent, join a partner by code)
- Partner: Overview funnel adds verified and eligible stages, plus volume, P&L and profitable vs losing; **Brokers** (connect, upload or sync the list, health); **Packages**; Clients get verification and consent-gated P&L
- Admin: application review (approve / reject / ask for info), **Programme** overview (funnel across all partners, partner-wise trading table, CSV export), **Reviews** queue (manual verifications plus suspicious attribution), **Settings**

## Not in this phase
Commissions and payouts, real broker API adapters (need credentials), partner-uploaded indicators or algorithms, paid subscriptions.
