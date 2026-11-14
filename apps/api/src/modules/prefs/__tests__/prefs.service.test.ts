import { beforeEach, describe, expect, it, vi } from 'vitest';
import { tradingPrefsUpdateSchema } from '@tradinjournal/contracts';

const db = vi.hoisted(() => ({ findUnique: vi.fn(), upsert: vi.fn() }));
vi.mock('@tradinjournal/db', () => ({ prisma: { tradingPrefs: db } }));
const warn = vi.hoisted(() => vi.fn());
vi.mock('@tradinjournal/logger', () => ({ logger: { warn, info: vi.fn(), error: vi.fn() } }));

const svc = await import('../prefs.service.js');
const missing = (code = 'P2021') => Object.assign(new Error('The table `public.trading_prefs` does not exist'), { code });
const row = (p: Partial<{ rules: unknown; riskCapPct: unknown; layouts: unknown }> = {}) => ({ rules: {}, riskCapPct: '2.000', layouts: {}, updatedAt: new Date('2026-11-14T10:00:00Z'), ...p });

beforeEach(() => { db.findUnique.mockReset(); db.upsert.mockReset(); warn.mockReset(); svc.resetPrefsState(); });

describe('rules mapping', () => {
  it('DB flat shape ↔ API shape, junk dropped', () => {
    const api = svc.rulesFromDb({ maxTradesPerDay: 3, hoursFrom: '07:00', hoursTo: '16:00', maxRiskPct: 'x', maxSizeX: 0.5, stopAfterLosses: 2, extra: 1 });
    expect(api).toEqual({ maxTradesPerDay: 3, tradingHours: { from: '07:00', to: '16:00' }, maxRiskPct: null, stopAfterLosses: 2, dailyLossCapPct: null, maxSizeX: null });
    expect(svc.rulesToDb(api)).toEqual({ maxTradesPerDay: 3, hoursFrom: '07:00', hoursTo: '16:00', stopAfterLosses: 2 });
    expect(svc.rulesFromDb(null)).toEqual(svc.EMPTY_RULES);
    expect(svc.rulesFromDb({ hoursFrom: '25:00', hoursTo: '16:00' }).tradingHours).toBeNull();
  });
  it('layouts: invalid stored JSON falls back to {}', () => {
    expect(svc.layoutsFromDb({ dashboard: { tabs: [{ id: 'mine', name: 'Mine', widgets: ['equity:8', 'leaks'] }] } }).dashboard!.tabs).toHaveLength(1);
    expect(svc.layoutsFromDb({ dashboard: { tabs: [{ id: 'x', name: 'X', widgets: ['nope'] }] } })).toEqual({});
  });
});

describe('getPrefs', () => {
  it('no row → defaults, persisted', async () => {
    db.findUnique.mockResolvedValue(null);
    expect(await svc.getPrefs('u1')).toEqual({ rules: svc.EMPTY_RULES, riskCapPct: 2, layouts: {}, persisted: true, updatedAt: null });
  });
  it('row → DTO with decimal risk cap', async () => {
    db.findUnique.mockResolvedValue(row({ rules: { maxSizeX: 2 }, riskCapPct: '1.250' }));
    const p = await svc.getPrefs('u1');
    expect(p.rules.maxSizeX).toBe(2);
    expect(p.riskCapPct).toBe(1.25);
    expect(p.updatedAt).toBe('2026-11-14T10:00:00.000Z');
  });
  it('missing table/column → defaults with persisted:false, warned once', async () => {
    db.findUnique.mockRejectedValue(missing());
    expect((await svc.getPrefs('u1')).persisted).toBe(false);
    db.findUnique.mockRejectedValue(missing('P2022'));
    expect((await svc.getPrefs('u1')).persisted).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
  });
  it('other errors propagate', async () => {
    db.findUnique.mockRejectedValue(new Error('boom'));
    await expect(svc.getPrefs('u1')).rejects.toThrow('boom');
  });
});

describe('updatePrefs', () => {
  it('upserts only what was sent, rules in DB shape', async () => {
    db.upsert.mockImplementation(async ({ create }: { create: Record<string, unknown> }) => row({ ...create }));
    const input = tradingPrefsUpdateSchema.parse({ rules: { tradingHours: { from: '22:00', to: '02:00' }, maxTradesPerDay: null }, riskCapPct: 1.5 });
    const out = await svc.updatePrefs('u1', input);
    expect(db.upsert).toHaveBeenCalledWith({ where: { userId: 'u1' }, create: { userId: 'u1', rules: { hoursFrom: '22:00', hoursTo: '02:00' }, riskCapPct: 1.5 }, update: { rules: { hoursFrom: '22:00', hoursTo: '02:00' }, riskCapPct: 1.5 } });
    expect(out.rules.tradingHours).toEqual({ from: '22:00', to: '02:00' });
    expect(out.riskCapPct).toBe(1.5);
    expect(out.persisted).toBe(true);
  });
  it('missing table → 503 "Settings storage isn\'t ready yet"', async () => {
    db.upsert.mockRejectedValue(missing());
    await expect(svc.updatePrefs('u1', { riskCapPct: 1 })).rejects.toMatchObject({ statusCode: 503, code: 'PREFS_NOT_READY', message: "Settings storage isn't ready yet" });
  });
});

describe('rulesFor (insights)', () => {
  it('null when unset, cached, cleared on save', async () => {
    db.findUnique.mockResolvedValue({ rules: {} });
    expect(await svc.rulesFor('u2')).toBeNull();
    db.findUnique.mockResolvedValue({ rules: { maxTradesPerDay: 2 } });
    expect(await svc.rulesFor('u2')).toBeNull(); // cached
    db.upsert.mockResolvedValue(row({ rules: { maxTradesPerDay: 2 } }));
    await svc.updatePrefs('u2', { rules: { maxTradesPerDay: 2 } });
    expect((await svc.rulesFor('u2'))!.maxTradesPerDay).toBe(2);
  });
  it('never throws: missing table → null; other error → null, not cached', async () => {
    db.findUnique.mockRejectedValue(missing());
    expect(await svc.rulesFor('u3')).toBeNull();
    db.findUnique.mockRejectedValueOnce(new Error('timeout')).mockResolvedValue({ rules: { maxSizeX: 2 } });
    expect(await svc.rulesFor('u4')).toBeNull();
    expect((await svc.rulesFor('u4'))!.maxSizeX).toBe(2);
  });
});

describe('update schema', () => {
  it('validates rules, hours and layouts', () => {
    expect(tradingPrefsUpdateSchema.safeParse({}).success).toBe(false);
    expect(tradingPrefsUpdateSchema.safeParse({ rules: { tradingHours: { from: '07:00', to: '07:00' } } }).success).toBe(false);
    expect(tradingPrefsUpdateSchema.safeParse({ rules: { maxTradesPerDay: 0 } }).success).toBe(false);
    expect(tradingPrefsUpdateSchema.safeParse({ rules: { bogus: 1 } }).success).toBe(false);
    expect(tradingPrefsUpdateSchema.safeParse({ riskCapPct: 11 }).success).toBe(false);
    expect(tradingPrefsUpdateSchema.safeParse({ layouts: { dashboard: { tabs: [{ id: 'a', name: 'A', widgets: ['equity', 'equity:8'] }] } } }).success).toBe(false);
    expect(tradingPrefsUpdateSchema.safeParse({ layouts: { dashboard: { tabs: [{ id: 'a', name: 'A', widgets: ['equity:5'] }] } } }).success).toBe(false);
    expect(tradingPrefsUpdateSchema.safeParse({ layouts: { dashboard: { tabs: [{ id: 'c-1', name: 'Mine', widgets: ['equity:12', 'recent'] }] } } }).success).toBe(true);
  });
});
