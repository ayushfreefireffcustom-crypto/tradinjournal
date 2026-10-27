// Live smoke test for every AI feature against the configured provider. Spends
// real tokens, so it is never part of the unit suite. Run with a key in env:
//   ANTHROPIC_API_KEY=… LOG_LEVEL=debug pnpm --filter api ai:check
// Uses a SAMPLE trader (labelled as such) and a few sample headlines; SignalX
// pulls live public candles. Prints latency and the validated output per check.
import type { TraderContext } from '@tradinjournal/core';
import { getProvider, isAiEnabled } from '../lib/ai/provider.js';
import { routeQuery } from '../lib/ai/router.js';
import { getSearchProvider } from '../lib/ai/search.js';
import { REPORT_PROMPT, contextMessageContent } from '../lib/ai/prompts.js';
import { buildMessages } from '../modules/ai/ai.service.js';
import { enrichNews } from '../lib/news/enrich.js';
import { BRIEF_PROMPT, briefUserContent } from '../lib/news/prompts.js';
import { analyze } from '../modules/trader/trader.service.js';
import { answerMacroQuestion, streamMacroAnswer } from '../modules/macro/macro-assistant.service.js';

const SAMPLE: TraderContext = {
  summary: {
    netPnl: 11174.75, totalTrades: 78, openTrades: 0, winRate: 0.667, profitFactor: 3.13, expectancy: 143.27,
    avgWin: 316, avgLoss: -202, bestTrade: 956.21, worstTrade: -616.58, maxDrawdownPct: 0.03, maxWinStreak: 7,
    maxLossStreak: 3, avgDurationSecs: 15000, startingBalance: 25000, currentEquity: 36174.75,
  },
  bestDay: { day: 'Wednesday', netPnl: 3053, trades: 14 },
  worstDay: { day: 'Tuesday', netPnl: -331, trades: 12 },
  bestSession: { name: 'London', netPnl: 6120 },
  direction: { long: { trades: 34, wins: 22, netPnl: 3803 }, short: { trades: 44, wins: 30, netPnl: 7372 } },
  holdAsymmetry: { winnerAvgSecs: 9000, loserAvgSecs: 21600, ratio: 2.4 },
  topSymbols: [{ symbol: 'NAS100', netPnl: 4210, winRate: 0.71, trades: 21 }],
  worstSymbols: [{ symbol: 'GBPUSD', netPnl: -420, winRate: 0.4, trades: 10 }],
  tilt: { count: 6, netPnl: -1290 },
  recentTrades: [
    { closeTime: '2026-10-27T17:19:00Z', symbol: 'NAS100', direction: 'SHORT', netPnl: 473.86, rProxy: 1.6, durationSecs: 15060 },
    { closeTime: '2026-10-27T18:36:00Z', symbol: 'NAS100', direction: 'LONG', netPnl: -446.93, rProxy: -1.1, durationSecs: 26340 },
  ],
  insights: ['Losers are held 2.4x longer than winners.', 'Tuesdays are the only red weekday.'],
} as TraderContext;

const HEADLINES = [
  { title: 'Fed holds rates steady, signals patience on cuts', source: 'Reuters', impact: 'HIGH' },
  { title: 'Bitcoin ETFs log fifth straight day of inflows', source: 'Bloomberg', impact: 'MEDIUM' },
  { title: 'Oil steadies as Red Sea shipping insurance costs climb', source: 'FT', impact: 'MEDIUM' },
];

async function timed<T>(label: string, fn: () => Promise<T>): Promise<void> {
  const t0 = Date.now();
  try {
    const out = await fn();
    const text = typeof out === 'string' ? out : JSON.stringify(out, null, 1);
    console.log(`\n✔ ${label} · ${Date.now() - t0} ms\n${text.slice(0, 900)}`);
  } catch (err) {
    console.log(`\n✘ ${label} · ${Date.now() - t0} ms · ${(err as Error).message}`);
  }
}

/** Stream and report time-to-first-token as well as total time. */
async function streamed(label: string, iter: () => AsyncIterable<string>): Promise<void> {
  await timed(label, async () => {
    const t0 = Date.now();
    let first = 0;
    let text = '';
    for await (const tok of iter()) {
      if (!first) first = Date.now() - t0;
      text += tok;
    }
    return `[first token ${first} ms]\n${text}`;
  });
}

async function main(): Promise<void> {
  if (!isAiEnabled()) throw new Error('AI is off — set ANTHROPIC_API_KEY (or another provider key).');
  // SignalX persists its analysis row: never let a smoke test write to a hosted DB.
  if (!/@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL ?? '')) {
    throw new Error('Refusing to run: DATABASE_URL must point at a local database.');
  }
  const ai = getProvider();
  console.log(`provider model: ${ai.model}`);

  for (const q of ['why do I lose on Tuesdays?', "what's on the economic calendar this week?", 'given my NAS100 edge, what moves the index this week?']) {
    await timed(`router: ${q}`, () => routeQuery(q, ai));
  }

  const search = getSearchProvider();
  if (search) await timed(`search (${search.name})`, () => search.search('economic calendar this week high impact events'));

  const history = [{ role: 'user' as const, content: 'What is my biggest leak, in one paragraph?' }];
  await streamed('coach turn 1', () => ai.stream(buildMessages(SAMPLE, history), { effort: 'medium', maxTokens: 6000 }));
  const turn2 = [...history, { role: 'assistant' as const, content: 'Holding losers 2.4x longer than winners.' }, { role: 'user' as const, content: 'Give me one rule to fix it.' }];
  await streamed('coach turn 2 (cache read expected)', () => ai.stream(buildMessages(SAMPLE, turn2), { effort: 'medium', maxTokens: 6000 }));

  await timed('weekly review', () =>
    ai.complete(
      [
        { role: 'system', content: REPORT_PROMPT },
        { role: 'system', content: contextMessageContent(SAMPLE) },
        { role: 'user', content: 'Write my performance review.' },
      ],
      { effort: 'medium', maxTokens: 6000 },
    ),
  );

  await timed('news enrichment', async () =>
    Object.fromEntries(await enrichNews(HEADLINES.map((h, i) => ({ id: `h${i}`, title: h.title })))),
  );
  await streamed('news brief', () =>
    ai.stream([{ role: 'system', content: BRIEF_PROMPT }, { role: 'user', content: briefUserContent(HEADLINES) }], { effort: 'low', maxTokens: 4000 }),
  );

  await timed('macro assistant', async () => (await answerMacroQuestion('What is the current macro regime telling me?')).answer);
  await streamed('macro assistant (stream)', () => streamMacroAnswer('Is liquidity expanding or contracting?'));

  await timed('SignalX BTCUSDT 1h+4h', async () => {
    const r = await analyze({ symbol: 'BTCUSDT', timeframes: ['1h', '4h'] });
    return { aiUsed: r.aiUsed, direction: r.direction, entry: [r.entryLow, r.entryHigh], stop: r.stop, t: [r.t1, r.t2, r.t3], rationale: r.rationale };
  });
}

main().then(() => process.exit(0), err => {
  console.error(err);
  process.exit(1);
});
