'use client';

// "Moved since <top story>": the nine-asset scoreboard. Each cell is the move
// since the story was published (bp for yields), the last price and a
// sparkline of the bars since. Falls back to the last 24h when the markets
// were closed since the story (fewer than three assets traded).
import { BOARD, boardLine, fmtLevel, fmtMove, hhmm, moveSince, type Mine, type Move, type NewsStory, type ReactionSeries } from '@/lib/news-map-api';
import { AiLine, You } from './bits';
import { Spark } from './charts';

interface Cell { m: Move; vals: number[] }

function cells(idx: Map<string, ReactionSeries>, t: number): Cell[] {
  const out: Cell[] = [];
  for (const k of BOARD) {
    const s = idx.get(k);
    const m = moveSince(s, t);
    if (!s || !m) continue;
    const from = s.points.findIndex(p => p[0] >= m.baseAt);
    const pts = s.points.slice(Math.max(0, Math.min(from, s.points.length - 8)));
    out.push({ m, vals: pts.map(p => p[1]) });
  }
  return out;
}

export default function Board({ top, idx, mine, loading, failed }: { top: NewsStory | null; idx: Map<string, ReactionSeries>; mine: Mine; loading: boolean; failed: boolean }) {
  const t0 = top ? Date.parse(top.publishedAt) : NaN;
  let list = Number.isFinite(t0) ? cells(idx, t0) : [];
  let since = Number.isFinite(t0) && list.length >= 3 ? t0 : NaN;
  if (!Number.isFinite(since)) {
    // The markets mostly didn't trade since the story: show the last 24h instead.
    since = Date.now() - 24 * 3600_000;
    list = idx.size ? cells(idx, since) : [];
  }
  const anchored = top && since === t0;
  const end = list.length ? Math.max(...list.map(c => c.m.lastAt)) : NaN;
  const line = boardLine(list.map(c => c.m));
  const label = anchored ? 'Moved since the top story' : 'Moved in the last 24h';

  return (
    <section className="nw-sec" data-testid="news-board">
      <div className="nw-sh">
        <h2 className="nw-h2-ell">{label}</h2>
        {list.length > 0 && <span className="nw-m num">{hhmm(list[0]!.m.baseAt)} → {hhmm(end)} UTC</span>}
        {line && <div className="nw-sh-r"><AiLine n={list.length} what="feeds" text={line} /></div>}
      </div>
      {loading && !list.length ? (
        <div className="nw-rx nw-rx--sk" aria-hidden>{BOARD.map(k => <div key={k}><i /></div>)}</div>
      ) : list.length === 0 ? (
        <p className="nw-none nw-none--line">{failed ? 'Prices unavailable right now.' : 'No price data yet.'}</p>
      ) : (
        <div className="nw-rx" style={{ ['--n' as string]: list.length }}>
          {list.map(({ m, vals }) => (
            <div key={m.key} className="nw-rx-c">
              <div className="nw-rx-s">{m.key}{mine.open.has(m.key === 'WTI' ? 'WTIUSD' : m.key) && <You>Open</You>}</div>
              <div className={`nw-rx-v num nw-${m.dir}`}>{fmtMove(m)}</div>
              <div className="nw-rx-p num">{fmtLevel(m)}</div>
              <Spark vals={vals} dir={m.dir} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
