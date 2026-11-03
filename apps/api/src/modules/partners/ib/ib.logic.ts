// Pure rules for IB verification and partner-package access — no I/O, unit-tested.
import type { EntitlementStatusDto, ProgramSettingsDto, VerificationStatusDto } from '@tradinjournal/contracts';

const DAY_MS = 86_400_000;

// ── Settings ──────────────────────────────────────────────────────────────────

/** Defaults the boss can change in Admin › Partners › Settings. */
export const DEFAULT_SETTINGS: ProgramSettingsDto = {
  activeMinTrades: 1,
  activeWindowDays: 30,
  activeMinLots: 0,
  graceDays: 7,
  partnerGraceDays: 7,
  lockedPerks: [],
};

export function mergeSettings(raw: unknown): ProgramSettingsDto {
  const v = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  const int = (k: keyof ProgramSettingsDto, min: number, max: number) => {
    const n = Number(v[k]);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : DEFAULT_SETTINGS[k] as number;
  };
  const lots = Number(v.activeMinLots);
  return {
    activeMinTrades: int('activeMinTrades', 0, 1000),
    activeWindowDays: int('activeWindowDays', 1, 365),
    activeMinLots: Number.isFinite(lots) && lots >= 0 ? lots : DEFAULT_SETTINGS.activeMinLots,
    graceDays: int('graceDays', 0, 90),
    partnerGraceDays: int('partnerGraceDays', 0, 90),
    lockedPerks: Array.isArray(v.lockedPerks) ? v.lockedPerks.filter((x): x is string => typeof x === 'string') : [],
  };
}

export function isActiveTrader(s: { tradesInWindow: number; lotsInWindow: number }, rule: ProgramSettingsDto): boolean {
  return s.tradesInWindow >= rule.activeMinTrades && s.lotsInWindow >= rule.activeMinLots;
}

export function ruleText(rule: ProgramSettingsDto): string {
  const t = `${rule.activeMinTrades} closed trade${rule.activeMinTrades === 1 ? '' : 's'}`;
  const l = rule.activeMinLots > 0 ? ` and ${rule.activeMinLots} lots` : '';
  return `${t}${l} in the last ${rule.activeWindowDays} days`;
}

// ── Referred-accounts list ────────────────────────────────────────────────────

export interface IbRow { accountId: string; email: string | null }

const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;
const ACCOUNT_RE = /^[A-Za-z0-9_-]{3,30}$/;

function splitLine(line: string, delim: string): string[] {
  // Minimal CSV: handles quoted cells, no embedded newlines.
  const out: string[] = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
    else if (ch === delim && !q) { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out.map(c => c.trim());
}

/**
 * Reads a referred-accounts list: CSV, TSV, semicolons, or plain pasted lines.
 * With a header row it uses the account / login / UID column and the email column;
 * without one it takes the first account-like cell and the first email on each line.
 */
export function parseIbList(text: string): { rows: IbRow[]; skipped: number } {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (!lines.length) return { rows: [], skipped: 0 };
  const first = lines[0]!;
  const delim = first.includes('\t') ? '\t' : first.includes(';') && !first.includes(',') ? ';' : ',';
  const head = splitLine(first, delim).map(h => h.toLowerCase());
  const accIdx = head.findIndex(h => /account|login|uid|mt5|mt4|client id|trading id|^id$/.test(h));
  const mailIdx = head.findIndex(h => /e-?mail/.test(h));
  const hasHeader = accIdx >= 0 || mailIdx >= 0;
  const seen = new Map<string, IbRow>();
  let skipped = 0;
  for (const line of hasHeader ? lines.slice(1) : lines) {
    const cells = splitLine(line, delim);
    let acc: string | undefined, mail: string | undefined;
    if (hasHeader && accIdx >= 0) acc = cells[accIdx];
    if (hasHeader && mailIdx >= 0) mail = cells[mailIdx];
    if (!hasHeader || accIdx < 0) acc = cells.find(c => ACCOUNT_RE.test(c) && /\d/.test(c) && !EMAIL_RE.test(c));
    if (!hasHeader || mailIdx < 0) mail = cells.find(c => EMAIL_RE.test(c));
    const accountId = acc && ACCOUNT_RE.test(acc) ? acc : null;
    if (!accountId) { skipped++; continue; }
    const email = mail && EMAIL_RE.test(mail) ? mail.toLowerCase() : null;
    seen.set(accountId, { accountId, email: email ?? seen.get(accountId)?.email ?? null });
  }
  return { rows: [...seen.values()], skipped };
}

// ── Verification ──────────────────────────────────────────────────────────────

export interface VerifyInput {
  partnerName: string;
  brokerKey: string | null;
  brokerLabel: string;
  /** Broker keys the referring partner has connected. */
  partnerBrokers: string[];
  /** The account's login is in the referring partner's list (not removed). */
  listedHere: { id: string } | null;
  /** The login is listed under a different partner's IB. */
  listedElsewhere: boolean;
  /** The email the client gave is in the referring partner's list. */
  emailListed: boolean;
  prev: { status: VerificationStatusDto; method: string | null; reviewRequestedAt: Date | null } | null;
}

export interface VerifyOutcome {
  status: VerificationStatusDto;
  method: string | null;
  ibAccountId: string | null;
  reason: string | null;
  signal: string | null;
}

/**
 * Decides one account's verification. Only the account number proves IB attribution:
 * an email match is a signal for a human, and admin decisions stick.
 */
export function decideVerification(i: VerifyInput): VerifyOutcome {
  if (i.prev?.method === 'manual' && (i.prev.status === 'VERIFIED' || i.prev.status === 'REJECTED')) {
    return { status: i.prev.status, method: 'manual', ibAccountId: null, reason: i.prev.status === 'REJECTED' ? 'An admin reviewed this account and could not confirm it.' : null, signal: null };
  }
  if (i.listedHere) return { status: 'VERIFIED', method: 'account', ibAccountId: i.listedHere.id, reason: null, signal: null };
  if (!i.brokerKey || !i.partnerBrokers.includes(i.brokerKey)) {
    return {
      status: 'UNSUPPORTED_BROKER', method: null, ibAccountId: null, signal: null,
      reason: i.brokerKey
        ? `${i.partnerName} hasn’t connected ${i.brokerLabel} yet, so this account can’t be checked.`
        : `We couldn’t tell which broker this account is with, so it can’t be checked against ${i.partnerName}’s IB.`,
    };
  }
  const signal = i.listedElsewhere ? 'other-partner' : i.emailListed ? 'email-match' : null;
  if (i.prev?.reviewRequestedAt || i.emailListed) {
    return {
      status: 'MANUAL_REVIEW', method: null, ibAccountId: null, signal,
      reason: i.emailListed
        ? `Your email is on ${i.partnerName}’s list but this account number isn’t. Our team will check it.`
        : 'Our team is reviewing this account.',
    };
  }
  return {
    status: 'NOT_FOUND', method: null, ibAccountId: null, signal,
    reason: i.listedElsewhere
      ? `This account is registered under a different partner’s IB at ${i.brokerLabel}.`
      : `This account isn’t in ${i.partnerName}’s ${i.brokerLabel} list yet. New accounts can take a day to show up — retry later or ask for a review.`,
  };
}

// ── Package access ────────────────────────────────────────────────────────────

export interface EligibilityInput {
  partnerName: string;
  partnerActive: boolean;
  pkg: { status: string; brokers: string[]; requireActive: boolean };
  /** Broker keys of this client's VERIFIED accounts. */
  verifiedBrokers: string[];
  activeTrader: boolean;
  rule: ProgramSettingsDto;
}

export function evaluatePackage(i: EligibilityInput): { qualifies: boolean; reasons: string[]; partnerPaused: boolean } {
  const reasons: string[] = [];
  if (!i.partnerActive) reasons.push(`${i.partnerName}’s partner programme is paused.`);
  if (i.pkg.status !== 'LIVE') reasons.push(`${i.partnerName} has withdrawn this package.`);
  const ok = i.pkg.brokers.length ? i.verifiedBrokers.filter(b => i.pkg.brokers.includes(b)) : i.verifiedBrokers;
  if (!ok.length) {
    reasons.push(i.pkg.brokers.length
      ? `Verify a broker account opened under ${i.partnerName} at ${i.pkg.brokers.length === 1 ? 'that broker' : 'one of the listed brokers'}.`
      : `Verify a broker account opened under ${i.partnerName}.`);
  }
  if (i.pkg.requireActive && !i.activeTrader) reasons.push(`Trade at least ${ruleText(i.rule)}.`);
  return { qualifies: reasons.length === 0, reasons, partnerPaused: !i.partnerActive };
}

export interface EntitlementState {
  status: EntitlementStatusDto;
  grantedAt: Date;
  expiresAt: Date | null;
  graceUntil: Date | null;
  suspendedAt: Date | null;
  reason: string | null;
}

/**
 * Next state of a client's access to one package. Returns null when nothing should
 * exist (never qualified). A lapse goes through a grace period before suspension;
 * qualifying again restores access unless the access period has run out.
 */
export function nextEntitlement(
  prev: EntitlementState | null,
  ev: { qualifies: boolean; reasons: string[]; partnerPaused: boolean },
  accessDays: number | null,
  rule: ProgramSettingsDto,
  now: Date,
): EntitlementState | null {
  const reason = ev.reasons.join(' ') || null;
  if (!prev) {
    if (!ev.qualifies) return null;
    return { status: 'ACTIVE', grantedAt: now, expiresAt: accessDays ? new Date(now.getTime() + accessDays * DAY_MS) : null, graceUntil: null, suspendedAt: null, reason: null };
  }
  if (prev.status === 'EXPIRED') return prev;
  if (prev.expiresAt && now >= prev.expiresAt) return { ...prev, status: 'EXPIRED', graceUntil: null, reason: 'Your access period has ended.' };
  if (ev.qualifies) return { ...prev, status: 'ACTIVE', graceUntil: null, suspendedAt: null, reason: null };
  if (prev.status === 'ACTIVE') {
    const days = ev.partnerPaused ? rule.partnerGraceDays : rule.graceDays;
    if (days <= 0) return { ...prev, status: 'SUSPENDED', graceUntil: null, suspendedAt: now, reason };
    return { ...prev, status: 'GRACE', graceUntil: new Date(now.getTime() + days * DAY_MS), reason };
  }
  if (prev.status === 'GRACE') {
    if (prev.graceUntil && now >= prev.graceUntil) return { ...prev, status: 'SUSPENDED', suspendedAt: now, reason };
    return { ...prev, reason };
  }
  return { ...prev, reason };
}

export function sameState(a: EntitlementState, b: EntitlementState): boolean {
  const t = (d: Date | null) => d?.getTime() ?? null;
  return a.status === b.status && t(a.expiresAt) === t(b.expiresAt) && t(a.graceUntil) === t(b.graceUntil)
    && t(a.suspendedAt) === t(b.suspendedAt) && a.reason === b.reason && t(a.grantedAt) === t(b.grantedAt);
}

/** Perks this user may use: unlocked ones, plus locked ones their live packages include. */
export function allowedPerks(locked: string[], held: { status: string; perks: string[] }[], all: string[]): string[] {
  const mine = new Set(held.filter(h => h.status === 'ACTIVE' || h.status === 'GRACE').flatMap(h => h.perks));
  return all.filter(k => !locked.includes(k) || mine.has(k));
}
