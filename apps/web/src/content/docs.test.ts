import { describe, expect, it } from 'vitest';
import { DOCS, SECTIONS, docBySlug, searchDocs } from './docs';

describe('docs', () => {
  it('has unique slugs, real sections and working related links', () => {
    expect(new Set(DOCS.map((d) => d.slug)).size).toBe(DOCS.length);
    for (const d of DOCS) {
      expect(SECTIONS).toContain(d.section);
      expect(d.body.en.length).toBeGreaterThan(200);
      for (const r of d.related ?? []) expect([d.slug, r, !!docBySlug(r)]).toEqual([d.slug, r, true]);
    }
    for (const s of SECTIONS) expect(DOCS.some((d) => d.section === s)).toBe(true);
  });
  it('searches by every word, titles first', () => {
    expect(searchDocs('two-factor')[0]!.slug).toBe('two-factor');
    expect(searchDocs('backup codes').map((d) => d.slug)).toContain('two-factor');
    expect(searchDocs('webhook')[0]!.slug).toBe('trading-desk');
    expect(searchDocs('zzz-no-such-thing')).toEqual([]);
    expect(searchDocs('  ')).toHaveLength(DOCS.length);
  });
  it('links inside articles point at pages that exist', () => {
    const pages = ['/strategies', '/charts', '/help'];
    for (const d of DOCS) for (const m of d.body.en.matchAll(/\]\((\/[^)]+)\)/g)) expect(pages.some((p) => m[1]!.startsWith(p))).toBe(true);
  });
});
