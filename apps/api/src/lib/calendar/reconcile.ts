// The "both providers contribute" engine. Several calendar sources describe the
// same real event; this collapses them into one record:
//   1. build a dedup key from the release identity: currency (+ country when it
//      isn't the currency's home country) | hour bucket | canonical title,
//   2. group provider rows by that key,
//   3. field-level merge by a configured provider-priority list — schedule/impact
//      from the highest-priority source that has them; actual/forecast/previous
//      from whoever provides a value (freshest actual wins),
//   4. keep every provider's raw values + which source won each field as
//      provenance (same idea as AiMessage.sources).
//
// Matching is deliberately PRECISE. Two titles only merge when they name the
// same release: the canonical title keeps every word that changes the measure
// (U6 vs headline, core vs headline, m/m vs y/y, private vs total payrolls,
// advance vs preliminary, a benchmark revision). Only spelling is normalised
// ("m/m" = "MoM", "Non-Farm" = "Nonfarm", "Prelim GDP" = "GDP Prel"), plus a
// short table of exact whole-title synonyms where providers name one release
// differently ("Non-Farm Employment Change" = "Non Farm Payrolls"). A missed
// cross-provider merge costs a duplicate row; a wrong merge puts one release's
// actual next to another's forecast, so when in doubt titles stay apart.
//
// Providers don't hand us stable cross-provider ids, so the title is the
// identity. As a backstop, one provider never lists the same release twice: if
// a group ends up holding two different titles from the same provider, the
// group is split back by its literal titles.
//
// Pure and deterministic — no I/O — so it's unit-tested exhaustively.
import type { NormalizedEvent, EventImpact } from './types.js';
import { currencyToCountry } from './providers/util.js';

/** Words spelled several ways across providers → one spelling. Whole words only. */
const SPELLINGS: Array<[RegExp, string]> = [
  [/\bconsumer price index\b/g, 'cpi'],
  [/\bproducer price index\b/g, 'ppi'],
  [/\bgross domestic product\b/g, 'gdp'],
  [/\bnon-?farm\b/g, 'non farm'],
  [/\blabour\b/g, 'labor'],
];

/**
 * Release-stage qualifiers. They're part of the identity (an advance GDP print
 * is not the preliminary one) but providers put them in different places
 * ("Prelim GDP q/q" vs "GDP Growth Rate QoQ Prel"), so they're spelled one way
 * and moved to the end in a fixed order.
 */
const STAGES: Record<string, string> = {
  adv: 'adv', advance: 'adv',
  prel: 'prel', prelim: 'prel', preliminary: 'prel',
  flash: 'flash',
  final: 'final',
};
const STAGE_ORDER = ['adv', 'prel', 'flash', 'final'];

/**
 * Exact whole-title synonyms (matched on the canonical title without its stage
 * qualifiers). Every pair names ONE release; never add a pattern here. Scoped
 * to countries where the phrase is only safe there.
 */
const SYNONYMS: Array<{ from: string; to: string; countries?: string[] }> = [
  { from: 'nfp', to: 'non farm payrolls' },
  { from: 'non farm employment change', to: 'non farm payrolls' },
  { from: 'adp non farm employment change', to: 'adp employment change' },
  { from: 'unemployment claims', to: 'initial jobless claims' },
  { from: 'cpi mom', to: 'inflation rate mom' },
  { from: 'cpi yoy', to: 'inflation rate yoy' },
  { from: 'cpi qoq', to: 'inflation rate qoq' },
  { from: 'core cpi mom', to: 'core inflation rate mom' },
  { from: 'core cpi yoy', to: 'core inflation rate yoy' },
  { from: 'gdp qoq', to: 'gdp growth rate qoq' },
  { from: 'trade balance', to: 'balance of trade' },
  { from: 'uom consumer sentiment', to: 'michigan consumer sentiment', countries: ['US'] },
  { from: 'uom inflation expectations', to: 'michigan inflation expectations', countries: ['US'] },
  { from: 'beige book', to: 'fed beige book', countries: ['US'] },
  { from: 'nfib small business index', to: 'nfib business optimism index', countries: ['US'] },
  { from: 'federal funds rate', to: 'fed interest rate decision', countries: ['US'] },
  { from: 'main refinancing rate', to: 'ecb interest rate decision', countries: ['EU'] },
  { from: 'official bank rate', to: 'boe interest rate decision', countries: ['GB'] },
  { from: 'boj policy rate', to: 'boj interest rate decision', countries: ['JP'] },
  { from: 'overnight rate', to: 'boc interest rate decision', countries: ['CA'] },
  { from: 'cash rate', to: 'rba interest rate decision', countries: ['AU'] },
  { from: 'official cash rate', to: 'rbnz interest rate decision', countries: ['NZ'] },
  { from: 'snb policy rate', to: 'snb interest rate decision', countries: ['CH'] },
];

/**
 * Forex Factory lists euro-member releases under EUR with the member in the
 * title ("German Prelim CPI m/m"); TradingView sets the member as the country.
 */
const EURO_MEMBER_PREFIX: Record<string, string> = { german: 'DE', french: 'FR', italian: 'IT', spanish: 'ES' };

const MONTHS = 'jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec';

const IMPACT_RANK: Record<EventImpact, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };

/**
 * Canonical spelling of a title, WITHOUT synonyms: lowercase, punctuation out,
 * period spelled one way (m/m → mom), stage qualifiers last. Two titles that
 * differ here are different literal titles.
 */
export function canonicalTitle(title: string): string {
  let t = title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '') // accents
    .replace(new RegExp(`\\((?:${MONTHS})[a-z]*\\)|\\(q[1-4]\\)`, 'g'), ' ') // reference period, e.g. "(Aug)"
    .replace(/\b([mqy])\s*\/\s*\1\b/g, (_, p: string) => `${p}o${p}`) // m/m → mom, q/q → qoq, y/y → yoy
    .replace(/\b([a-z])-(\d)/g, '$1$2') // U-6 → u6
    // Other punctuation out, as before; "(YoY)" keeps its words (it IS the measure).
    .replace(/[^a-z0-9\s%/.-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  for (const [re, to] of SPELLINGS) t = t.replace(re, to);
  const words = t.split(' ').filter(Boolean);
  const stages = new Set<string>();
  const core = words.filter(w => {
    const s = STAGES[w];
    if (s) stages.add(s);
    return !s;
  });
  // A title that is ONLY a qualifier word stays as it is.
  if (core.length === 0) return words.join(' ');
  return [...core, ...STAGE_ORDER.filter(s => stages.has(s))].join(' ');
}

/** Split a canonical title into its core and its trailing stage qualifiers. */
function splitStages(canonical: string): { core: string; stages: string } {
  const words = canonical.split(' ');
  let i = words.length;
  while (i > 1 && STAGE_ORDER.includes(words[i - 1]!)) i--;
  return { core: words.slice(0, i).join(' '), stages: words.slice(i).join(' ') };
}

/**
 * The release name used for matching: the canonical title with exact
 * synonyms applied. `country` scopes the country-specific synonyms.
 */
export function normalizeTitle(title: string, country?: string): string {
  const canonical = canonicalTitle(title);
  const { core, stages } = splitStages(canonical);
  const cc = country?.toUpperCase();
  const syn = SYNONYMS.find(s => s.from === core && (!s.countries || (cc != null && s.countries.includes(cc))));
  if (!syn) return canonical;
  return stages ? `${syn.to} ${stages}` : syn.to;
}

type IdentityInput = Pick<NormalizedEvent, 'currency' | 'title'> & { country?: string };

/**
 * Who published the release and under what name: the row's country (or, for a
 * euro-member release filed under EUR, the member named in the title) and the
 * title with that member prefix removed.
 */
export function releaseIdentity(e: IdentityInput): { currency: string; country: string; title: string } {
  const currency = e.currency.toUpperCase();
  let country = (e.country || currencyToCountry(currency)).toUpperCase();
  let title = e.title;
  if (currency === 'EUR' && country === 'EU') {
    const m = /^\s*(german|french|italian|spanish)\s+(.+)$/i.exec(title);
    if (m) {
      country = EURO_MEMBER_PREFIX[m[1]!.toLowerCase()]!;
      title = m[2]!;
    }
  }
  return { currency, country, title };
}

/** Bucket a UTC time to the hour so slightly-different provider timestamps align. */
function hourBucket(d: Date): string {
  return d.toISOString().slice(0, 13); // YYYY-MM-DDTHH
}

type KeyInput = Pick<NormalizedEvent, 'currency' | 'eventTimeUtc' | 'title'> & { country?: string };

function keyOf(e: KeyInput, titleFn: (title: string, country: string) => string): string {
  const id = releaseIdentity(e);
  // The country only joins the key when it isn't the currency's home country
  // (DE/FR/IT/ES under EUR), so most keys read as before: "USD|hour|title".
  const scope = id.country === currencyToCountry(id.currency) ? id.currency : `${id.currency}-${id.country}`;
  return `${scope}|${hourBucket(e.eventTimeUtc)}|${titleFn(id.title, id.country)}`;
}

/** Stable dedup key: currency[-country] | hour | release name. Same release → same key. */
export function dedupKey(e: KeyInput): string {
  return keyOf(e, normalizeTitle);
}

/** The key with the literal (synonym-free) title — the fallback when a synonym over-merges. */
function literalKey(e: KeyInput): string {
  return keyOf(e, canonicalTitle);
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
  // The release's country from its identity (a member named in the title beats
  // the currency's home country) — the same for every row in the group.
  const country = releaseIdentity(top).country;
  winners.country = top.source;
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

function groupBy<T>(rows: T[], key: (r: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const k = key(row);
    const g = groups.get(k);
    if (g) g.push(row);
    else groups.set(k, [row]);
  }
  return groups;
}

/** True when one provider contributed two different literal titles to a group. */
function sameProviderConflict(rows: NormalizedEvent[]): boolean {
  const seen = new Map<string, string>();
  for (const r of rows) {
    const t = canonicalTitle(releaseIdentity(r).title);
    const prev = seen.get(r.source);
    if (prev !== undefined && prev !== t) return true;
    seen.set(r.source, t);
  }
  return false;
}

/**
 * Reconcile a flat list of provider rows (across all providers) into one merged
 * record per real event.
 */
export function reconcileEvents(rows: NormalizedEvent[], priority: string[]): ReconciledEvent[] {
  const out: ReconciledEvent[] = [];
  for (const [key, group] of groupBy(rows, dedupKey)) {
    if (sameProviderConflict(group)) {
      for (const [lk, sub] of groupBy(group, literalKey)) out.push(mergeGroup(sub, lk, priority));
    } else {
      out.push(mergeGroup(group, key, priority));
    }
  }
  return out.sort((a, b) => a.eventTimeUtc.getTime() - b.eventTimeUtc.getTime());
}

export { IMPACT_RANK };
