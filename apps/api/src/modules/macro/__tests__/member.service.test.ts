import { describe, it, expect, vi, beforeEach } from 'vitest';

const findUnique = vi.fn();
const create = vi.fn();
const update = vi.fn();
const findMany = vi.fn();
const signalFindMany = vi.fn();

vi.mock('@tradinjournal/db', () => ({
  prisma: {
    macroMember: { findUnique, create, update, findMany },
    macroSignal: { findMany: signalFindMany },
  },
}));

vi.mock('@tradinjournal/config', () => ({
  env: {
    MACRO_ADMIN_EMAILS_LIST: ['admin@desk.com'],
  },
}));

vi.mock('@tradinjournal/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

const {
  applyMembership,
  approveMember,
  rejectMember,
  getMembership,
  isMacroAdmin,
  listSignals,
} = await import('../macro-member.service.js');
const { ConflictError, ForbiddenError, NotFoundError } = await import('../../../http/errors.js');

const baseRow = {
  id: 'm1',
  userId: 'u1',
  exchange: 'DELTA',
  exchangeUid: 'ex-1',
  status: 'PENDING' as const,
  plan: 'tradeai',
  expiresAt: null as Date | null,
  createdAt: new Date('2026-08-01T00:00:00.000Z'),
  updatedAt: new Date('2026-08-01T00:00:00.000Z'),
};

describe('isMacroAdmin', () => {
  it('is case-insensitive and trims', () => {
    expect(isMacroAdmin('Admin@Desk.com')).toBe(true);
    expect(isMacroAdmin(' admin@desk.com ')).toBe(true);
    expect(isMacroAdmin('other@x.com')).toBe(false);
    expect(isMacroAdmin(null)).toBe(false);
  });
});

describe('applyMembership', () => {
  beforeEach(() => {
    findUnique.mockReset();
    create.mockReset();
    update.mockReset();
  });

  it('creates a PENDING application', async () => {
    findUnique.mockResolvedValue(null);
    create.mockResolvedValue({ ...baseRow, status: 'PENDING' });
    const dto = await applyMembership('u1', { exchange: 'DELTA', exchangeUid: '  ex-1  ' });
    expect(create).toHaveBeenCalledWith({
      data: { userId: 'u1', exchange: 'DELTA', exchangeUid: 'ex-1', status: 'PENDING' },
    });
    expect(dto.status).toBe('PENDING');
  });

  it('rejects duplicate PENDING applications', async () => {
    findUnique.mockResolvedValue({ ...baseRow, status: 'PENDING' });
    await expect(applyMembership('u1', { exchange: 'DELTA', exchangeUid: 'x' })).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it('rejects when already APPROVED', async () => {
    findUnique.mockResolvedValue({ ...baseRow, status: 'APPROVED' });
    await expect(applyMembership('u1', { exchange: 'DELTA', exchangeUid: 'x' })).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it('allows re-apply after REJECTED', async () => {
    findUnique.mockResolvedValue({ ...baseRow, status: 'REJECTED' });
    update.mockResolvedValue({ ...baseRow, status: 'PENDING', exchange: 'COINDCX', exchangeUid: 'new' });
    const dto = await applyMembership('u1', { exchange: 'COINDCX', exchangeUid: 'new' });
    expect(update).toHaveBeenCalled();
    expect(dto.status).toBe('PENDING');
  });
});

describe('approve/reject', () => {
  beforeEach(() => {
    findUnique.mockReset();
    update.mockReset();
  });

  it('blocks non-admins', async () => {
    await expect(approveMember('m1', 'nope@x.com')).rejects.toBeInstanceOf(ForbiddenError);
    await expect(rejectMember('m1', 'nope@x.com')).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('404s unknown ids', async () => {
    findUnique.mockResolvedValue(null);
    await expect(approveMember('missing', 'admin@desk.com')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('approves a pending member', async () => {
    findUnique.mockResolvedValue({ ...baseRow });
    update.mockResolvedValue({ ...baseRow, status: 'APPROVED' });
    const dto = await approveMember('m1', 'admin@desk.com');
    expect(dto.status).toBe('APPROVED');
  });

  it('is idempotent when already approved', async () => {
    findUnique.mockResolvedValue({ ...baseRow, status: 'APPROVED' });
    const dto = await approveMember('m1', 'admin@desk.com');
    expect(update).not.toHaveBeenCalled();
    expect(dto.status).toBe('APPROVED');
  });
});

describe('getMembership / listSignals', () => {
  it('returns null when no row', async () => {
    findUnique.mockResolvedValue(null);
    expect(await getMembership('u1')).toBeNull();
  });

  it('listSignals returns latest DTOs from MacroSignal rows', async () => {
    signalFindMany.mockResolvedValue([
      {
        id: 's1',
        asset: 'BTC',
        direction: 'LONG',
        entryLow: 100,
        entryHigh: 102,
        stop: 95,
        t1: 107,
        t2: 112,
        t3: 118,
        confidence: 60,
        rationale: 'test',
        invalidation: 'test',
        accountSize: 100000,
        qty: 10,
        asOf: new Date('2026-08-07T00:00:00.000Z'),
        engineVer: 'macro-0.1.0',
      },
    ]);
    const rows = await listSignals();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.asset).toBe('BTC');
    expect(rows[0]!.direction).toBe('LONG');
  });
});
