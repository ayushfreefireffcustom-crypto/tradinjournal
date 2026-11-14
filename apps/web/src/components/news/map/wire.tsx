'use client';

// The wire: one line per kept story, newest first under UTC hour headers.
// Score + bar, red rows for 80+, inline prints (A/F), the moved tickers, the
// outlet count and the personal chip. "Everything" lists every story,
// including the ones under the bar (dimmed).
import type { CalendarEvent } from '@/lib/api';
import { groupByHour, hhmm, isHot, storyMoves, youTag, type Mine, type NewsCounts, type NewsStory, type ReactionSeries } from '@/lib/news-map-api';
import { Mv, You } from './bits';

interface Props {
  rows: NewsStory[];
  idx: Map<string, ReactionSeries>;
  prints: Map<string, CalendarEvent[]>;
  mine: Mine;
  onOpen: (s: NewsStory) => void;
}

export function NoiseBar({ c }: { c: NewsCounts }) {
  const total = c.kept + c.merged + c.hidden || 1;
  return (
    <span className="nw-noise" data-testid="news-noise">
      <span className="num"><b>{c.kept.toLocaleString('en-US')}</b> kept</span>
      <span className="nw-noise-bar" aria-hidden>
        <i style={{ flex: c.kept / total, background: 'var(--tx)' }} />
        <i style={{ flex: c.merged / total, background: 'var(--dim)' }} />
        <i style={{ flex: c.hidden / total, background: 'var(--line-2)' }} />
      </span>
      <span className="num">{c.merged.toLocaleString('en-US')} merged · {c.hidden.toLocaleString('en-US')} hidden</span>
    </span>
  );
}

export default function Wire({ rows, idx, prints, mine, onOpen }: Props) {
  const groups = groupByHour(rows);
  return (
    <div className="nw-wire" data-testid="news-wire">
      {groups.map(g => (
        <div key={g.key} role="list" aria-label={`${g.hour} UTC`}>
          <div className="nw-hg num">{g.hour}</div>
          {g.rows.map(s => <Row key={s.id} s={s} idx={idx} prints={prints.get(s.id) ?? []} mine={mine} onOpen={onOpen} />)}
        </div>
      ))}
    </div>
  );
}

function Row({ s, idx, prints, mine, onOpen }: { s: NewsStory; idx: Map<string, ReactionSeries>; prints: CalendarEvent[]; mine: Mine; onOpen: (s: NewsStory) => void }) {
  const hot = isHot(s.score);
  const low = s.score < 40 && s.impact !== 'HIGH';
  const moves = storyMoves(s, idx).slice(0, 3);
  const you = youTag(s, mine);
  return (
    <div role="listitem" className={`nw-wr${hot ? ' nw-wr--hot' : ''}${low ? ' nw-wr--low' : ''}`} data-testid="news-wire-row">
      <span className="nw-wr-t num">{hhmm(s.publishedAt)}</span>
      <span className="nw-wr-sc"><b className="num">{s.score}</b><i style={{ width: Math.round((s.score / 100) * 36) }} /></span>
      <button type="button" className="nw-wr-h" onClick={() => onOpen(s)} title={s.title}>
        <span className="nw-wr-ht">{s.title}</span>
        {prints.length > 0 && (
          <span className="nw-wr-dt num">{prints.map(e => <span key={e.id}>{e.title} <b>{e.actual}</b>{e.forecast ? ` F ${e.forecast}` : ''}</span>)}</span>
        )}
      </button>
      <span className="nw-wr-mvs">{moves.map(m => <Mv key={m.key} m={m} />)}</span>
      <span className="nw-wr-n num" title={`${s.sourceCount} outlet${s.sourceCount === 1 ? '' : 's'}`}>{s.sourceCount}</span>
      <span className="nw-wr-y">{you && <You>{you.kind === 'open' ? 'Open trade' : 'You trade'}</You>}</span>
    </div>
  );
}
