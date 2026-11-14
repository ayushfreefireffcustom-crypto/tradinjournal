// Support tool: "why is this user's MT5 account failing?"
//
// Looks the account up by id or MT5 login, tries the login live through the
// bridge's /diagnose (with the stored investor password, or one support pastes
// in to test — never stored), and lays the answer next to what the database
// knows: sync status, the last failures with their exact bridge reasons, the
// server clock model and whether the Elefin gate even allows the account.
import { prisma, type BrokerAccount } from '@tradinjournal/db';
import { diagnoseLogin, type BridgeDiagnosis } from '../../lib/broker-connector.js';
import { decryptSecret } from '../../lib/secrets.js';
import { accountUsable } from '../../lib/broker-policy.js';
import { formatTz, tzOf } from '../../lib/server-time.js';
import { ConflictError, NotFoundError } from '../../http/errors.js';

export interface DiagnoseInput {
  /** Test this password instead of the stored one. Used for the attempt only, never saved. */
  password?: string;
  /** Test against this server name instead of the stored one (e.g. a suspected typo). */
  server?: string;
  /** Disambiguates an MT5 login that exists on several servers. */
  accountServer?: string;
}

const RECENT_RUNS = 5;

/** Where the tested password came from; `undecryptable` = one is stored but this key can't read it. */
export type PasswordSource = 'stored' | 'provided' | 'none' | 'undecryptable';

/** `ref` is a broker_account id, or an MT5 login number. */
export async function findBrokerAccount(ref: string, server?: string): Promise<BrokerAccount> {
  const byId = await prisma.brokerAccount.findUnique({ where: { id: ref } });
  if (byId) return byId;
  if (!/^\d{1,20}$/.test(ref)) throw new NotFoundError(`No broker account with id ${ref}`);
  const matches = await prisma.brokerAccount.findMany({
    where: { mt5Login: BigInt(ref), ...(server ? { server } : {}) },
    orderBy: { createdAt: 'asc' },
  });
  if (!matches.length) throw new NotFoundError(`No broker account with MT5 login ${ref}${server ? ` on ${server}` : ''}`);
  if (matches.length > 1) {
    throw new ConflictError(`MT5 login ${ref} is connected on several servers (${matches.map(m => `${m.server} → ${m.id}`).join(', ')}); pass accountServer or use the account id.`);
  }
  return matches[0]!;
}

/** The headline: one sentence support can read out, plus what to do next. */
export function summarise(input: {
  account: Pick<BrokerAccount, 'status' | 'lastSyncError'>;
  usable: boolean;
  passwordSource: PasswordSource;
  bridge: BridgeDiagnosis | null;
}): { verdict: string; summary: string; nextStep: string } {
  const { account, usable, passwordSource, bridge } = input;
  if (!usable) {
    return { verdict: 'BLOCKED_BY_ACCESS_GATE', summary: 'The account isn’t on an Elefin server, so the access gate never lets it sync.', nextStep: 'Expected while Elefin-only access is on. Grant access or ask the user to connect an Elefin account.' };
  }
  if (passwordSource === 'undecryptable') {
    return { verdict: 'PASSWORD_UNREADABLE', summary: 'A password is stored but this server can’t decrypt it (encryption key differs or was rotated), so it can’t be tested or used.', nextStep: 'Run this from the production API, or pass `password` to test one directly. If production also shows this, the user must re-enter their investor password.' };
  }
  if (passwordSource === 'none' || !bridge) {
    return { verdict: 'NO_PASSWORD', summary: 'No investor password is stored for this account, so it can’t sync.', nextStep: 'Ask the user to re-enter their investor password under Brokers.' };
  }
  const tested = passwordSource === 'provided' ? 'the password you supplied' : 'the stored password';
  switch (bridge.verdict) {
    case 'OK':
      return passwordSource === 'provided'
        ? { verdict: 'OK', summary: `${tested} signs in fine.`, nextStep: account.status === 'ERROR' ? 'The stored password is the problem: have the user update it under Brokers (or save this one).' : 'Nothing to fix for this password.' }
        : { verdict: 'OK', summary: `Signs in fine with ${tested} right now. ${account.lastSyncError ? 'The stored error is from an earlier attempt.' : ''}`.trim(), nextStep: account.lastSyncError ? 'Trigger a sync (or wait for the next one); it should clear the error.' : 'Nothing to fix.' };
    case 'LOGIN_REJECTED':
      return {
        verdict: `LOGIN_REJECTED/${bridge.reason ?? '?'}`,
        summary: `MT5 won’t sign in with ${tested}. ${bridge.explanation}`,
        nextStep: bridge.reason === 'AUTH_FAILED'
          ? 'Ask the user for their current investor password and the exact server name shown in MT5.'
          : 'Ask the user to check the account is still active at Elefin and re-enter their investor password; test it here with `password` first.',
      };
    case 'TERMINAL_DOWN':
    case 'TERMINAL_UNAVAILABLE':
      return { verdict: `${bridge.verdict}/${bridge.reason ?? '?'}`, summary: `Our MT5 terminal is the problem, not the user. ${bridge.explanation}`, nextStep: 'Check the Windows bridge host (terminal running, logged in, not updating), then re-run this check.' };
    default:
      return { verdict: bridge.verdict, summary: bridge.explanation, nextStep: 'Bridge-side problem: check it is running and up to date, then re-run.' };
  }
}

export async function diagnoseBrokerAccount(ref: string, input: DiagnoseInput = {}) {
  const account = await findBrokerAccount(ref, input.accountServer);
  const [user, executions, newest, runs, usable] = await Promise.all([
    prisma.user.findUnique({ where: { id: account.userId }, select: { id: true, email: true, name: true } }),
    prisma.execution.count({ where: { brokerAccountId: account.id } }),
    prisma.execution.findFirst({ where: { brokerAccountId: account.id }, orderBy: { dealTime: 'desc' }, select: { dealTime: true, serverOffsetMin: true } }),
    prisma.syncRun.findMany({
      where: { brokerAccountId: account.id }, orderBy: { startedAt: 'desc' }, take: RECENT_RUNS,
      select: { status: true, error: true, dealsPulled: true, tradesBuilt: true, startedAt: true, finishedAt: true },
    }),
    accountUsable(account.userId, account),
  ]);

  const storedPassword = account.password ? safeDecrypt(account.password) : null;
  const password = input.password ?? storedPassword;
  const passwordSource: PasswordSource = input.password ? 'provided'
    : storedPassword ? 'stored'
    : account.password ? 'undecryptable' : 'none';
  const server = input.server ?? account.server;
  const bridge = password ? await diagnoseLogin({ login: Number(account.mt5Login), password, server }) : null;
  const tz = tzOf(account);

  return {
    ...summarise({ account, usable, passwordSource, bridge }),
    checkedAt: new Date().toISOString(),
    account: {
      id: account.id,
      user,
      broker: account.broker,
      mt5Login: account.mt5Login.toString(),
      server: account.server,
      testedServer: server,
      passwordSource,
      status: account.status,
      usableUnderAccessGate: usable,
      lastSyncAt: account.lastSyncAt,
      lastSyncError: account.lastSyncError,
      syncRetryAt: account.syncRetryAt,
      lastDealAt: account.lastDealAt,
      storedDeals: executions,
      newestStoredDeal: newest?.dealTime ?? null,
      serverClock: {
        model: tz ? formatTz(tz) : null,
        lastReadingMin: account.serverOffsetMin,
        readingSince: account.serverOffsetAt,
        newestDealConverted: newest ? newest.serverOffsetMin != null : null,
      },
    },
    recentSyncs: runs,
    bridge,
  };
}

/** A password that can't be decrypted (rotated key) is reported, not thrown. */
function safeDecrypt(enc: string): string | null {
  try {
    return decryptSecret(enc);
  } catch {
    return null;
  }
}
