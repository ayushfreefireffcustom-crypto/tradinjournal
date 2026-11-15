import { describe, expect, it } from 'vitest';
import { DOCS, SECTIONS, docBySlug, isSwitchedOff, searchDocs, visibleDocs } from './docs';

describe('docs', () => {
  it('has unique slugs, real sections and working related links', () => {
    expect(new Set(DOCS.map((d) => d.slug)).size).toBe(DOCS.length);
    for (const d of DOCS) {
      expect(SECTIONS).toContain(d.section);
      expect(d.body.en.length).toBeGreaterThan(200);
      for (const r of d.related ?? []) expect([d.slug, r, !!docBySlug(r, true)]).toEqual([d.slug, r, true]);
    }
    for (const s of SECTIONS) expect(DOCS.some((d) => d.section === s)).toBe(true);
  });
  it('searches by every word, titles first', () => {
    expect(searchDocs('two-factor')[0]!.slug).toBe('two-factor');
    expect(searchDocs('backup codes').map((d) => d.slug)).toContain('two-factor');
    expect(searchDocs('webhook', 'en', true)[0]!.slug).toBe('trading-desk');
    expect(searchDocs('zzz-no-such-thing')).toEqual([]);
    expect(searchDocs('  ', 'en', true)).toHaveLength(DOCS.length);
  });
  it('hides trading guides while trading is switched off', () => {
    const off = visibleDocs(false).map((d) => d.slug);
    for (const s of ['copy-trading', 'trading-desk', 'connect-exchange']) {
      expect(off).not.toContain(s);
      expect(docBySlug(s, false)).toBeUndefined();
      expect(isSwitchedOff(s, false)).toBe(true);
      expect(isSwitchedOff(s, true)).toBe(false);
      expect(docBySlug(s, true)).toBeDefined();
    }
    expect(off).toContain('options');
    expect(isSwitchedOff('no-such-doc', false)).toBe(false);
    expect(searchDocs('webhook', 'en', false).map((d) => d.slug)).not.toContain('trading-desk');
    expect(searchDocs('  ', 'en', false)).toHaveLength(DOCS.length - 3);
    // The section left empty is dropped by the page; every other section keeps a guide.
    expect(SECTIONS.filter((s) => !visibleDocs(false).some((d) => d.section === s))).toEqual(['Copy trading and the desk']);
  });
  it('links inside articles point at pages that exist', () => {
    const pages = ['/strategies', '/charts', '/help'];
    for (const d of DOCS) for (const m of d.body.en.matchAll(/\]\((\/[^)]+)\)/g)) expect(pages.some((p) => m[1]!.startsWith(p))).toBe(true);
  });
});
