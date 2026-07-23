// The "both providers contribute" engine. Several calendar sources describe the
// same real event; this collapses them into one record:
//   1. build a dedup key (currency | hour-bucket | normalized title, with an
//      alias table so "NFP" and "Non-Farm Payrolls" collapse together),
//   2. group provider rows by that key,
//   3. field-level merge by a configured provider-priority list — schedule/impact
//      from the highest-priority source that has them; actual/forecast/previous
//      from whoever provides a value (freshest actual wins),
//   4. keep every provider's raw values + which source won each field as
//      provenance (same idea as AiMessage.sources).
//
// Pure and deterministic — no I/O — so it's unit-tested exhaustively.
import type { NormalizedEvent, EventImpact } from './types.js';

/** Title aliases: variants on the left normalize to the canonical form on the right. */
const TITLE_ALIASES: Array<[RegExp, string]> = [
  [/\bnon[-\s]?farm\s+payrolls?\b/i, 'nfp'],
  [/\bnfp\b/i, 'nfp'],
  [/\bconsumer\s+price\s+index\b/i, 'cpi'],
  [/\bcpi\b/i, 'cpi'],
  [/\bproducer\s+price\s+index\b/i, 'ppi'],
  [/\bgross\s+domestic\s+product\b/i, 'gdp'],
  [/\bgdp\b/i, 'gdp'],
  [/\bfederal\s+funds\s+rate\b/i, 'fed rate decision'],
  [/\binterest\s+rate\s+decision\b/i, 'rate decision'],
  [/\bunemployment\s+rate\b/i, 'unemployment rate'],
];

const IMPACT_RANK: Record<EventImpact, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };

/** Lowercase, strip punctuation, collapse whitespace, apply the alias table. */
export function normalizeTitle(title: string): string {
  let t = title
    .toLowerCase()
    .replace(/\(.*?\)/g, ' ') // drop parenthetical qualifiers e.g. "(YoY)"
    .replace(/[^a-z0-9\s%/.-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  for (const [pattern, canonical] of TITLE_ALIASES) {
    if (pattern.test(t)) {
      t = canonical;
      break;
    }
  }
  return t;
}

/** Bucket a UTC time to the hour so slightly-different provider timestamps align. */
function hourBucket(d: Date): string {
  return d.toISOString().slice(0, 13); // YYYY-MM-DDTHH
}

/** Stable dedup key: currency | hour | normalized title. Same event → same key. */
export function dedupKey(e: Pick<NormalizedEvent, 'currency' | 'eventTimeUtc' | 'title'>): string {
  return `${e.currency.toUpperCase()}|${hourBucket(e.eventTimeUtc)}|${normalizeTitle(e.title)}`;
}

export interface ReconciledEvent {
  dedupKey: string;
  title: string;
  country: string;
  currency: string;
  category: string | null;
  impact: EventImpact;
  eventTimeUtc: Date;
  actual: string | null;
  forecast: string | null;
  previous: string | null;
  unit: string | null;
  /** Provenance: which source won each merged field + every provider's raw row. */
  sources: {
    winners: Record<string, string>; // field -> source name
    raw: Array<{ source: string } & Partial<NormalizedEvent>>;
    /** Sources that disagreed on impact — surfaced for review, not fatal. */
    impactConflict?: boolean;
  };
}

/** Rank rows by the provider-priority list (unknown providers sort last). */
function priorityRank(source: string, priority: string[]): number {
  const i = priority.indexOf(source);
  return i === -1 ? priority.length : i;
}

/**
 * Merge many provider rows for the SAME event into one record. `priority` orders
 * providers for schedule/impact/category; numeric fields prefer any present value.
 */
function mergeGroup(rows: NormalizedEvent[], key: string, priority: string[]): ReconciledEvent {
  const byPriority = [...rows].sort((a, b) => priorityRank(a.source, priority) - priorityRank(b.source, priority));
  const top = byPriority[0]!;
  const winners: Record<string, string> = {};

  // Schedule / labels: first (highest-priority) row that has the field.
  const pick = <K extends keyof NormalizedEvent>(field: K): NormalizedEvent[K] | undefined => {
    for (const r of byPriority) {
      const v = r[field];
      if (v !== undefined && v !== null && v !== '') {
        winners[field as string] = r.source;
        return v;
      }
    }
    return undefined;
  };

  const title = pick('title') ?? top.title;
  const country = pick('country') ?? top.country;
  const eventTimeUtc = pick('eventTimeUtc') ?? top.eventTimeUtc;
  const category = pick('category') ?? null;
  const unit = pick('unit') ?? null;

  // Impact: highest-priority source wins, but flag if sources disagree.
  const impact = pick('impact') ?? top.impact;
  const distinctImpacts = new Set(rows.map(r => r.impact));

  // Result numbers: prefer any present value in priority order. `actual` in
  // particular can arrive from a lower-priority source that released it first.
  const actual = pick('actual') ?? null;
  const forecast = pick('forecast') ?? null;
  const previous = pick('previous') ?? null;

  return {
    dedupKey: key,
    title,
    country,
    currency: top.currency.toUpperCase(),
    category,
    impact,
    eventTimeUtc,
    actual,
    forecast,
    previous,
    unit,
    sources: {
      winners,
      raw: rows.map(r => ({ ...r })),
      ...(distinctImpacts.size > 1 ? { impactConflict: true } : {}),
    },
  };
}

/**
 * Reconcile a flat list of provider rows (across all providers) into one merged
 * record per real event.
 */
export function reconcileEvents(rows: NormalizedEvent[], priority: string[]): ReconciledEvent[] {
  const groups = new Map<string, NormalizedEvent[]>();
  for (const row of rows) {
    const key = dedupKey(row);
    const g = groups.get(key);
    if (g) g.push(row);
    else groups.set(key, [row]);
  }
  return [...groups.entries()]
    .map(([key, group]) => mergeGroup(group, key, priority))
    .sort((a, b) => a.eventTimeUtc.getTime() - b.eventTimeUtc.getTime());
}

export { IMPACT_RANK };
