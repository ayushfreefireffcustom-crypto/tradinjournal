// Weekly AI market brief (E15): a short read of the past week across crypto,
// funding and the macro tiles, written by Claude from the numbers only (or a
// plain template without AI). Shown on the overview and added to the personal
// weekly review email. Cached per UTC day.
import { logger } from '@tradinjournal/logger';
import { cacheGet, cacheSet } from '../../lib/cache.js';
import { getProvider, isAiEnabled, type ChatMessage } from '../../lib/ai/provider.js';
import { marketOverview, type Overview } from './overview.service.js';
import { derivatives, type Derivatives } from '../derivatives/derivatives.service.js';

export interface MarketBrief {
  weekEnding: string;
  source: 'ai' | 'rules';
  headline: string;
  summary: string;
  bullets: string[];
  watch: string;
}
export interface BriefDeps {
  overview: () => Promise<Overview>;
  derivatives: () => Promise<Derivatives>;
  ai: () => boolean;
  write: (messages: ChatMessage[]) => Promise<unknown>;
  now: () => number;
  cache: boolean;
}
const SCHEMA = {
  type: 'object',
  properties: {
    headline: { type: 'string', description: 'One line, at most 90 characters, no clickbait.' },
    summary: { type: 'string', description: '2-3 sentences on how the week went.' },
    bullets: { type: 'array', items: { type: 'string' }, description: '3-5 short points, each with a number from the facts.' },
    watch: { type: 'string', description: '1-2 sentences on what is worth watching next, without advice.' },
  },
  required: ['headline', 'summary', 'bullets', 'watch'],
  additionalProperties: false,
} as const;
export const defaultBriefDeps: BriefDeps = {
  overview: () => marketOverview(),
  derivatives: () => derivatives(),
  ai: isAiEnabled,
  write: (m) => getProvider().json(m, SCHEMA, { effort: 'low', maxTokens: 1500 }),
  now: () => Date.now(),
  cache: true,
};

// Rounds first, so a tiny move reads "0.0%", never "-0.0%".
const pct = (v: number | null | undefined, d = 1) => {
  if (v == null) return 'n/a';
  const r = Number(v.toFixed(d));
  return r === 0 ? `${(0).toFixed(d)}%` : `${r > 0 ? '+' : ''}${r.toFixed(d)}%`;
};

export function factsFor(o: Overview, d: Derivatives | null) {
  return {
    btc7d: o.week.btc7d, eth7d: o.week.eth7d,
    top50Gainers7d: o.week.gainers, top50Losers7d: o.week.losers,
    breadth24h: { up: o.breadth.up, down: o.breadth.down, medianChange: o.breadth.medianChange },
    // One coin isn't a sector trend.
    sectors7d: o.sectors.filter((s) => s.change7d != null && s.count >= 2 && s.sector !== 'Other').map((s) => ({ sector: s.sector, coins: s.count, change7d: s.change7d, vsBtc7d: s.vsBtc7d })),
    fearGreed: o.fearGreed ? { now: o.fearGreed.value, label: o.fearGreed.label, weekAgo: o.fearGreed.history.at(-8)?.value ?? null } : null,
    altSeasonIndex: o.altSeason.index,
    funding: d?.source ? { oiWeightedPct: d.totals.weightedFunding, positiveShare: d.totals.positiveShare } : null,
    macroWeek: o.macro.filter((m) => m.spark.length >= 6).map((m) => ({ name: m.name, change5d: (m.spark.at(-1)! / m.spark.at(-6)! - 1) * 100 })),
  };
}

/** Template brief from the same facts. */
export function ruleBrief(f: ReturnType<typeof factsFor>): Omit<MarketBrief, 'weekEnding' | 'source'> {
  const dir = (v: number | null) => (v == null ? 'moved' : v > 1 ? 'rose' : v < -1 ? 'fell' : 'was little changed');
  // "fell 4.1%", not "fell -4.1%"; flat moves keep their sign.
  const by = (v: number | null) => (v == null ? '' : Math.abs(v) > 1 ? ` ${Math.abs(v).toFixed(1)}%` : ` (${pct(v)})`);
  const best = [...f.sectors7d].sort((a, b) => (b.change7d ?? 0) - (a.change7d ?? 0))[0];
  const worst = [...f.sectors7d].sort((a, b) => (a.change7d ?? 0) - (b.change7d ?? 0))[0];
  const bullets = [
    `Bitcoin ${pct(f.btc7d)} and Ether ${pct(f.eth7d)} over seven days.`,
    f.top50Gainers7d[0] ? `Biggest gainer in the top 50: ${f.top50Gainers7d[0].base} ${pct(f.top50Gainers7d[0].change7d)}; biggest faller: ${f.top50Losers7d[0]?.base ?? 'n/a'} ${pct(f.top50Losers7d[0]?.change7d)}.` : null,
    best && worst ? `Best sector ${best.sector} (${pct(best.change7d)}), weakest ${worst.sector} (${pct(worst.change7d)}).` : null,
    f.fearGreed ? `Fear & Greed at ${f.fearGreed.now} (${f.fearGreed.label})${f.fearGreed.weekAgo != null ? `, from ${f.fearGreed.weekAgo} a week ago` : ''}.` : null,
    f.funding?.oiWeightedPct != null ? `Funding averages ${f.funding.oiWeightedPct.toFixed(4)}% per period, weighted by open interest.` : null,
  ].filter((x): x is string => !!x);
  return {
    headline: `Bitcoin ${dir(f.btc7d)}${by(f.btc7d)} this week`,
    summary: `Bitcoin ${dir(f.btc7d)}${by(f.btc7d)} over the past seven days while Ether ${dir(f.eth7d)}${by(f.eth7d)}. In the last 24 hours ${f.breadth24h.up} of the top 100 pairs rose and ${f.breadth24h.down} fell.`,
    bullets,
    watch: 'Watch whether the leading sectors keep their edge over Bitcoin, and where funding goes as positions build or unwind.',
  };
}

const okStr = (v: unknown, max: number) => typeof v === 'string' && v.trim().length >= 5 && v.length <= max;

export async function weeklyMarketBrief(deps = defaultBriefDeps): Promise<MarketBrief> {
  const now = deps.now();
  const day = new Date(now).toISOString().slice(0, 10);
  const key = `brief:market:${day}`;
  if (deps.cache) { const hit = await cacheGet<MarketBrief>(key); if (hit) return hit; }
  const [o, d] = await Promise.all([deps.overview(), deps.derivatives().catch(() => null)]);
  const facts = factsFor(o, d);
  let out: MarketBrief = { weekEnding: day, source: 'rules', ...ruleBrief(facts) };
  if (deps.ai()) {
    try {
      const messages: ChatMessage[] = [
        { role: 'system', content: 'You write a short weekly crypto and macro market brief for retail traders. Use only the facts given; never invent numbers, names or events. Plain, calm English, no hype, no emojis, no markdown. Describe what happened; never tell the reader to buy or sell.' },
        { role: 'user', content: `Write this week's brief from these facts:\n${JSON.stringify(facts)}` },
      ];
      const j = (await deps.write(messages)) as Record<string, unknown>;
      const bullets = Array.isArray(j?.bullets) ? (j.bullets as unknown[]).filter((b): b is string => okStr(b, 240)).slice(0, 5) : [];
      if (okStr(j?.headline, 120) && okStr(j?.summary, 900) && okStr(j?.watch, 500) && bullets.length >= 2) {
        out = { weekEnding: day, source: 'ai', headline: String(j.headline).trim(), summary: String(j.summary).trim(), bullets, watch: String(j.watch).trim() };
      }
    } catch (err) {
      logger.warn(`[brief] AI market brief failed, using the template: ${(err as Error).message}`);
    }
  }
  if (deps.cache) await cacheSet(key, out, 12 * 3600);
  return out;
}
