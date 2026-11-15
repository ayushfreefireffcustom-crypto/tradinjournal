// Saved option legs outlive the contracts they point at: an expiry passes, or a
// strike is no longer listed. These helpers re-snap such legs to the nearest
// listed contract (or drop them) so the builder and the replay never send the
// server a leg it can't price.
import type { LegInput } from './options-api';

export interface ExpiryRef { code: string; expiry: number }

/** Delta expiry codes are DDMMYY. Settles at 12:00 UTC. */
export function parseExpiryCode(code: string | undefined | null): number | null {
  const m = /^(\d{2})(\d{2})(\d{2})$/.exec(code ?? '');
  if (!m) return null;
  const t = Date.UTC(2000 + Number(m[3]), Number(m[2]) - 1, Number(m[1]), 12);
  return Number.isFinite(t) && new Date(t).getUTCDate() === Number(m[1]) ? t : null;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "131126" → "13 Nov". Falls back to "an old expiry" rather than showing the raw code. */
export function expiryCodeLabel(code: string | undefined | null): string {
  const t = parseExpiryCode(code);
  if (t == null) return 'an old expiry';
  const d = new Date(t);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

const nearest = (xs: number[], x: number) => xs.reduce((a, b) => (Math.abs(b - x) < Math.abs(a - x) ? b : a), xs[0]!);

export interface Reconciled { legs: LegInput[]; notes: string[]; changed: boolean }

/**
 * Checks option legs against the listed expiries and, where known, the strikes
 * listed for each expiry. A leg whose expiry is gone moves to the nearest listed
 * expiry by date; a strike that isn't listed moves to the nearest listed one.
 * A leg is dropped only when nothing is listed to move it to. Futures pass
 * through. Prices are cleared on any move so the new contract's mark is used.
 * Idempotent: running it on its own output changes nothing.
 */
export function reconcileLegs(legs: LegInput[], expiries: ExpiryRef[], strikesByCode: Record<string, number[] | undefined> = {}): Reconciled {
  const notes: string[] = [];
  const out: LegInput[] = [];
  let changed = false;
  const codes = new Set(expiries.map((e) => e.code));
  legs.forEach((l, i) => {
    const n = i + 1;
    if (l.kind === 'future') { out.push(l); return; }
    let leg = l;
    if (!leg.expiry || !codes.has(leg.expiry)) {
      if (!expiries.length) { notes.push(`Leg ${n} removed: no expiries are listed.`); changed = true; return; }
      const was = parseExpiryCode(leg.expiry);
      const to = was == null ? expiries[0]! : expiries.reduce((a, b) => (Math.abs(b.expiry - was) < Math.abs(a.expiry - was) ? b : a), expiries[0]!);
      notes.push(leg.expiry ? `Leg ${n}: ${expiryCodeLabel(leg.expiry)} is no longer listed, moved to ${expiryCodeLabel(to.code)}.` : `Leg ${n}: set to ${expiryCodeLabel(to.code)}.`);
      leg = { ...leg, expiry: to.code, price: undefined, iv: undefined };
      changed = true;
    }
    const ks = strikesByCode[leg.expiry!];
    if (ks) {
      if (!ks.length) { notes.push(`Leg ${n} removed: no strikes listed for ${expiryCodeLabel(leg.expiry)}.`); changed = true; return; }
      if (leg.strike == null || !ks.includes(leg.strike)) {
        const k = leg.strike == null ? ks[Math.floor(ks.length / 2)]! : nearest(ks, leg.strike);
        if (leg.strike != null) notes.push(`Leg ${n}: strike ${leg.strike} isn't listed for ${expiryCodeLabel(leg.expiry)}, moved to ${k}.`);
        leg = { ...leg, strike: k, price: undefined, iv: undefined };
        changed = true;
      }
    }
    out.push(leg);
  });
  return { legs: changed ? out : legs, notes, changed };
}

/** Sorted unique strikes per expiry code from chain quotes. */
export function strikesOf(quotes: Array<{ strike: number }>): number[] {
  return [...new Set(quotes.map((q) => q.strike))].sort((a, b) => a - b);
}

/**
 * Full check before a one-shot request (the replay): snaps expiries from the
 * base chain, fetches each remaining expiry's chain for its strikes, then snaps
 * strikes. A chain that fails to load is skipped (its legs pass through).
 */
export async function checkLegs(
  legs: LegInput[],
  base: { expiry: string; expiries: ExpiryRef[]; quotes: Array<{ strike: number }> },
  fetchChain: (code: string) => Promise<{ quotes: Array<{ strike: number }> }>,
): Promise<Reconciled> {
  const first = reconcileLegs(legs, base.expiries);
  const need = [...new Set(first.legs.filter((l) => l.kind !== 'future' && l.expiry).map((l) => l.expiry!))];
  const strikes: Record<string, number[]> = {};
  await Promise.all(need.map(async (code) => {
    if (code === base.expiry) { strikes[code] = strikesOf(base.quotes); return; }
    try { strikes[code] = strikesOf((await fetchChain(code)).quotes); } catch { /* leave unchecked */ }
  }));
  const second = reconcileLegs(first.legs, base.expiries, strikes);
  return { legs: second.legs, notes: [...first.notes, ...second.notes], changed: first.changed || second.changed };
}

/** Index of the leg a server message like "Leg 2: …" points at (0-based), if any. */
export function badLegIndex(message: string | null | undefined): number | null {
  const m = /^Leg (\d+):/.exec(message ?? '');
  return m ? Number(m[1]) - 1 : null;
}
