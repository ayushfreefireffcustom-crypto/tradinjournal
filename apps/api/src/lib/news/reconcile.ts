// News dedup/clustering. The same story often appears across outlets and RSS
// feeds re-list items; this collapses duplicates into one canonical item:
//   - dedup key = canonical URL (host+path, no query/fragment) OR, when URLs
//     differ, a normalized-title key so the same headline clusters,
//   - the earliest-published item is canonical; the rest become "also reported
//     by" outlets kept in `sources`.
//
// Pure and deterministic — unit-tested.
import type { NormalizedNews } from './types.js';

/** Strip protocol, www, query, fragment, trailing slash → a stable URL key. */
export function canonicalUrl(raw: string): string {
  try {
    const u = new URL(raw);
    const host = u.host.replace(/^www\./, '');
    const path = u.pathname.replace(/\/+$/, '');
    return `${host}${path}`.toLowerCase();
  } catch {
    return raw.trim().toLowerCase();
  }
}

/** Lowercase, strip punctuation, collapse whitespace → a title cluster key. */
export function titleKey(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface ReconciledNews {
  dedupKey: string;
  url: string;
  title: string;
  summary: string | null;
  source: string; // canonical outlet
  outlets: string[]; // all outlets that carried it (incl. canonical)
  imageUrl: string | null;
  publishedAt: Date;
  country: string | null;
  category: NormalizedNews['category'] | null;
}

export function reconcileNews(rows: NormalizedNews[]): ReconciledNews[] {
  // First pass: collapse exact-URL duplicates, keeping the earliest.
  const byUrl = new Map<string, NormalizedNews[]>();
  for (const r of rows) {
    const key = canonicalUrl(r.url);
    (byUrl.get(key) ?? byUrl.set(key, []).get(key)!).push(r);
  }

  // Second pass: cluster distinct-URL items that share a title key.
  const byTitle = new Map<string, { key: string; rows: NormalizedNews[] }>();
  for (const [urlKey, group] of byUrl) {
    const canonical = group.reduce((a, b) => (a.publishedAt <= b.publishedAt ? a : b));
    const tKey = titleKey(canonical.title);
    const existing = byTitle.get(tKey);
    if (existing) existing.rows.push(...group);
    else byTitle.set(tKey, { key: urlKey, rows: [...group] });
  }

  const out: ReconciledNews[] = [];
  for (const { key, rows: group } of byTitle.values()) {
    const canonical = group.reduce((a, b) => (a.publishedAt <= b.publishedAt ? a : b));
    const outlets = [...new Set(group.map(g => g.outlet))];
    out.push({
      dedupKey: key,
      url: canonical.url,
      title: canonical.title,
      summary: canonical.summary ?? null,
      source: canonical.outlet,
      outlets,
      imageUrl: canonical.imageUrl ?? null,
      publishedAt: canonical.publishedAt,
      country: canonical.country ?? null,
      category: canonical.category ?? null,
    });
  }
  return out.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime());
}
