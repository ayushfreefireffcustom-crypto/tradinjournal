import { describe, it, expect, vi, beforeEach } from 'vitest';

// The weekly-review service is where the idempotency and skip-and-mark logic
// lives — the exact places a double-send or an infinite retry would come from.
// Everything it touches is mocked so each case controls the world precisely.

const prisma = {
  weeklyReviewSubscription: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    upsert: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  user: { findUnique: vi.fn() },
};
const findAccountsByUser = vi.fn();
const getReport = vi.fn();
const sendEmail = vi.fn();

vi.mock('@tradinjournal/db', () => ({ prisma }));
vi.mock('@tradinjournal/config', () => ({ env: { APP_URL: 'https://app.example.com' } }));
vi.mock('../../accounts/accounts.repository.js', () => ({ findAccountsByUser }));
vi.mock('../ai.report.service.js', () => ({ getReport }));
vi.mock('../../../lib/email/client.js', () => ({ sendEmail }));

const {
  sendWeeklyReview,
  listDueRecipients,
  getSubscription,
  setSubscription,
  unsubscribeByToken,
  unsubscribeUrl,
} = await import('../ai.weekly-review.service.js');

const SENT_AFTER = new Date('2026-07-20T00:00:00.000Z');

function account(id: string, broker = 'exness', mt5Login = '111') {
  return { id, broker, mt5Login };
}
function generatedReport(content = 'a real review') {
  return { content, cached: false, generated: true, stale: false, updatedAt: new Date().toISOString() };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Sensible defaults; individual tests override what they exercise.
  prisma.user.findUnique.mockResolvedValue({ name: 'Ayush Jo', email: 'a@example.com' });
  prisma.weeklyReviewSubscription.update.mockResolvedValue({});
  findAccountsByUser.mockResolvedValue([account('acc1')]);
  getReport.mockResolvedValue(generatedReport());
  sendEmail.mockResolvedValue(undefined);
});

describe('sendWeeklyReview', () => {
  it('skips (no email) when there is no subscription row', async () => {
    prisma.weeklyReviewSubscription.findUnique.mockResolvedValue(null);
    const out = await sendWeeklyReview({ userId: 'u1', sentAfter: SENT_AFTER });
    expect(out).toEqual({ sent: false, reason: 'not-subscribed' });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('skips when the subscription is disabled', async () => {
    prisma.weeklyReviewSubscription.findUnique.mockResolvedValue({ enabled: false, unsubscribeToken: 't' });
    const out = await sendWeeklyReview({ userId: 'u1', sentAfter: SENT_AFTER });
    expect(out).toEqual({ sent: false, reason: 'not-subscribed' });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('is idempotent: already sent this week → no email, no re-mark', async () => {
    prisma.weeklyReviewSubscription.findUnique.mockResolvedValue({
      enabled: true,
      unsubscribeToken: 't',
      lastSentAt: new Date('2026-07-21T09:00:00.000Z'), // after sentAfter
    });
    const out = await sendWeeklyReview({ userId: 'u1', sentAfter: SENT_AFTER });
    expect(out).toEqual({ sent: false, reason: 'already-sent' });
    expect(sendEmail).not.toHaveBeenCalled();
    expect(prisma.weeklyReviewSubscription.update).not.toHaveBeenCalled();
  });

  it('proceeds when the last send predates this run', async () => {
    prisma.weeklyReviewSubscription.findUnique.mockResolvedValue({
      enabled: true,
      unsubscribeToken: 't',
      lastSentAt: new Date('2026-07-13T09:00:00.000Z'), // before sentAfter
    });
    const out = await sendWeeklyReview({ userId: 'u1', sentAfter: SENT_AFTER });
    expect(out).toEqual({ sent: true, accounts: 1 });
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it('marks sent (so dispatch does not retry) when the user has no accounts', async () => {
    prisma.weeklyReviewSubscription.findUnique.mockResolvedValue({ enabled: true, unsubscribeToken: 't' });
    findAccountsByUser.mockResolvedValue([]);
    const out = await sendWeeklyReview({ userId: 'u1', sentAfter: SENT_AFTER });
    expect(out).toEqual({ sent: false, reason: 'no-accounts' });
    expect(prisma.weeklyReviewSubscription.update).toHaveBeenCalledTimes(1);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('marks sent and skips email when no account produced a written review', async () => {
    prisma.weeklyReviewSubscription.findUnique.mockResolvedValue({ enabled: true, unsubscribeToken: 't' });
    getReport.mockResolvedValue({ ...generatedReport(), generated: false }); // rule-based filler
    const out = await sendWeeklyReview({ userId: 'u1', sentAfter: SENT_AFTER });
    expect(out).toEqual({ sent: false, reason: 'no-content' });
    expect(prisma.weeklyReviewSubscription.update).toHaveBeenCalledTimes(1);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('sends, includes List-Unsubscribe headers, and marks sent on the happy path', async () => {
    prisma.weeklyReviewSubscription.findUnique.mockResolvedValue({ enabled: true, unsubscribeToken: 'tok123' });
    const out = await sendWeeklyReview({ userId: 'u1', sentAfter: SENT_AFTER });
    expect(out).toEqual({ sent: true, accounts: 1 });

    expect(sendEmail).toHaveBeenCalledTimes(1);
    const arg = sendEmail.mock.calls[0]![0];
    expect(arg.to).toBe('a@example.com');
    expect(arg.headers['List-Unsubscribe']).toContain('tok123');
    expect(arg.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
    expect(prisma.weeklyReviewSubscription.update).toHaveBeenCalledTimes(1);
  });

  it('one dead broker does not sink the digest — the healthy account still sends', async () => {
    prisma.weeklyReviewSubscription.findUnique.mockResolvedValue({ enabled: true, unsubscribeToken: 't' });
    findAccountsByUser.mockResolvedValue([account('bad'), account('good', 'ic', '222')]);
    getReport
      .mockRejectedValueOnce(new Error('broker auth failed'))
      .mockResolvedValueOnce(generatedReport('good review'));
    const out = await sendWeeklyReview({ userId: 'u1', sentAfter: SENT_AFTER });
    expect(out).toEqual({ sent: true, accounts: 1 });
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it('generates reports sequentially — never overlapping the MT5 bridge', async () => {
    prisma.weeklyReviewSubscription.findUnique.mockResolvedValue({ enabled: true, unsubscribeToken: 't' });
    findAccountsByUser.mockResolvedValue([account('a1'), account('a2'), account('a3')]);
    let inFlight = 0;
    let maxConcurrent = 0;
    getReport.mockImplementation(async () => {
      inFlight += 1;
      maxConcurrent = Math.max(maxConcurrent, inFlight);
      await new Promise(r => setTimeout(r, 5));
      inFlight -= 1;
      return generatedReport();
    });
    await sendWeeklyReview({ userId: 'u1', sentAfter: SENT_AFTER });
    expect(maxConcurrent).toBe(1);
    expect(getReport).toHaveBeenCalledTimes(3);
  });
});

describe('listDueRecipients', () => {
  it('queries only enabled subs not yet sent this run', async () => {
    prisma.weeklyReviewSubscription.findMany.mockResolvedValue([]);
    await listDueRecipients({ sentAfter: SENT_AFTER, limit: 100 });
    const where = prisma.weeklyReviewSubscription.findMany.mock.calls[0]![0].where;
    expect(where.enabled).toBe(true);
    expect(where.OR).toEqual([{ lastSentAt: null }, { lastSentAt: { lt: SENT_AFTER } }]);
  });

  it('returns a cursor when the page is full (more may remain)', async () => {
    prisma.weeklyReviewSubscription.findMany.mockResolvedValue([
      { id: 'r1', userId: 'u1' },
      { id: 'r2', userId: 'u2' },
    ]);
    const page = await listDueRecipients({ sentAfter: SENT_AFTER, limit: 2 });
    expect(page.recipients).toEqual([{ userId: 'u1' }, { userId: 'u2' }]);
    expect(page.nextCursor).toBe('r2');
  });

  it('returns no cursor on a partial page (the last one)', async () => {
    prisma.weeklyReviewSubscription.findMany.mockResolvedValue([{ id: 'r1', userId: 'u1' }]);
    const page = await listDueRecipients({ sentAfter: SENT_AFTER, limit: 100 });
    expect(page.nextCursor).toBeUndefined();
  });

  it('advances past the cursor with skip:1 on subsequent pages', async () => {
    prisma.weeklyReviewSubscription.findMany.mockResolvedValue([]);
    await listDueRecipients({ sentAfter: SENT_AFTER, limit: 100, cursor: 'r7' });
    const args = prisma.weeklyReviewSubscription.findMany.mock.calls[0]![0];
    expect(args.skip).toBe(1);
    expect(args.cursor).toEqual({ id: 'r7' });
  });
});

describe('subscription helpers', () => {
  it('getSubscription treats an absent row as not subscribed', async () => {
    prisma.weeklyReviewSubscription.findUnique.mockResolvedValue(null);
    expect(await getSubscription('u1')).toEqual({ enabled: false, lastSentAt: null });
  });

  it('setSubscription upserts and echoes the stored state', async () => {
    prisma.weeklyReviewSubscription.upsert.mockResolvedValue({ enabled: true, lastSentAt: null });
    const out = await setSubscription('u1', true);
    expect(out.enabled).toBe(true);
    const call = prisma.weeklyReviewSubscription.upsert.mock.calls[0]![0];
    expect(call.create.unsubscribeToken).toMatch(/^[0-9a-f]{64}$/); // 32 random bytes, hex
  });

  it('unsubscribeByToken reports whether a row matched', async () => {
    prisma.weeklyReviewSubscription.updateMany.mockResolvedValueOnce({ count: 1 });
    expect(await unsubscribeByToken('good')).toBe(true);
    prisma.weeklyReviewSubscription.updateMany.mockResolvedValueOnce({ count: 0 });
    expect(await unsubscribeByToken('bogus')).toBe(false);
  });

  it('builds an unsubscribe URL with an encoded token', async () => {
    expect(unsubscribeUrl('a b/c')).toBe('https://app.example.com/unsubscribe?token=a%20b%2Fc');
  });
});
