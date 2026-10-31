# Trading platform: decisions for Ayush (B0.9, B0.10)

## B0.9 Fixed outbound IP for exchange API keys

**Why it matters.** Exchanges let users lock an API key to a list of IP addresses. Delta India uses this, and Binance requires it for some trading permissions (see `exchange-api-global.md`). Our engine places orders from Railway. Without a fixed outbound IP, users must create keys with **no** IP restriction, which is weaker. Some exchanges also cap how long an unrestricted trading key lives.

**Options**

| Option | How | Cost | Notes |
|---|---|---|---|
| A. Railway static outbound IPs | Enable per service (Settings → Networking, or `railway outbound-network`), then redeploy. You get **3 IPv4 addresses**, load-balanced. | Needs the **Pro plan**; Railway's page doesn't list an extra fee. | IPs are tied to the region and may be **shared with other Railway customers**. Outbound only. MirrorPip-X already does this: its keys whitelist `208.77.246.240–242`. Source: https://docs.railway.com/reference/static-outbound-ips |
| B. Egress proxy (e.g. QuotaGuard / Fixie-style static proxy, or our own small VPS with a fixed IP running a forward proxy) | Engine sends exchange traffic through the proxy. | ≈ $5–30 per month | Dedicated IP, independent of Railway region. Adds one hop (some latency) and a component that can fail. |
| C. No IP restriction | Users create keys without a whitelist. | Free | Simplest. Weaker security, and not allowed for some permissions on some exchanges. |

**Recommendation:** **A** for the engine service only (it's the one process that talks to exchanges with user keys), if the account is on Pro. It's what MPX already runs in production. Show the 3 IPs on the "Connect exchange" screen so users can paste them into the whitelist. Keep C as an allowed fallback for testnet.

**Needs your call:** Is the TRADElogs Railway workspace on Pro (or OK to move it)? Do we accept shared IPs, or do you want a dedicated proxy (B)?

## B0.10 Legal question list (for an Indian lawyer, before anything trades live)

This is a list of **questions**, not advice. Nothing goes live until we have written answers (TODO Z9). Building and testing on **Delta testnet** can continue meanwhile.

**What we plan to offer**
1. Users connect their own crypto exchange accounts (Delta India first) with API keys: trade permission, **no** withdrawals. We never hold user funds.
2. **Copy trading:** a user picks a "leader" (another user) and our engine automatically places matching orders in the follower's own exchange account, scaled to their balance.
3. **Strategy execution:** users build rule-based strategies that our engine runs on their account.
4. Everything is free for now. Later we may charge a subscription and/or let leaders earn a fee or profit share.

**Questions**
1. Classification. Crypto (virtual digital assets) is not a SEBI-regulated security today. Does any SEBI regulation still apply to automated copy trading or strategy execution on crypto **derivatives**, for example the Investment Adviser or Research Analyst regulations if leaders publish trades for others to follow, or the Portfolio Management Services regulations if we "manage" follower accounts?
2. Does the answer change when (a) leaders are paid a fee or profit share, (b) we charge followers, (c) the follower sets sizing or limits and can stop at any time?
3. **FIU-IND / PMLA.** Do we need to register as a reporting entity (VDA service provider) even though we never custody funds or keys with withdrawal rights and the exchange (Delta India) is already registered? What KYC, if any, must we do on leaders or followers?
4. Should the user agreement say users trade at their own risk, with no guarantee of execution or performance? Can it limit our liability for missed, partial or slipped copies, exchange outages, or a leader's losses?
5. Can a user be a "leader" without any licence? Must we vet or restrict who becomes a leader (for example, ban leaders from promising returns)? What disclosures must a leader's profile carry (past performance not indicative, drawdown, risk of total loss)?
6. Advertising: can we show leader ROI and win rates publicly? What wording must surround performance figures (ASCI / SEBI finfluencer rules, if they apply)?
7. **Tax.** Does our engine placing orders trigger any obligation for us under the 1% TDS on VDA transfers (s.194S), or does that stay with the exchange? How should leader fees or profit shares be treated (GST on our fees; TDS on payouts to leaders)?
8. **Data protection (DPDP Act 2023).** We store encrypted exchange API keys and trading history. What consent, retention and breach-notification duties apply? Is storing API keys "significant data fiduciary" territory?
9. **Cross-border venues.** Can we offer connections to exchanges not registered with FIU-IND (Binance, Bybit, OKX) to Indian users? Should we geo-restrict those venues for Indian users?
10. **Options trading** (Phase 5) on crypto: any extra restriction versus perpetual futures?
11. **Minors and eligibility:** minimum age and residency checks needed?
12. If a follower makes losses because our software misbehaved (a bug placed a wrong size), what is our exposure, and is a dedicated insurance or indemnity clause needed?

**Documents we'd want back:** a short written opinion on 1–3 and 9, a reviewed Terms of Service + Risk Disclosure for copy trading, and leader terms.
