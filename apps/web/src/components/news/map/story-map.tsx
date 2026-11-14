'use client';

// The story map: the day's top stories as tiles whose area follows the score.
// #1 is the anchor (a full-height column on wide screens, a full-width block on
// narrow ones) with its prints, a since-publish reaction chart and the moved
// assets; the rest are a squarified treemap. Red tint + red top rule = 80+.
import { useEffect } from 'react';
import type { CalendarEvent } from '@/lib/api';
import {
  DESK_LABEL, hhmm, isHot, layoutMap, layoutTiles, storyMoves, youTag, type MapTile, type Mine, type NewsStory, type ReactionSeries,
} from '@/lib/news-map-api';
import { AiLine, Mv, You, useSize } from './bits';
import { ReactionChart, type ChartLine } from './charts';

const WIDE = 560;       // below this the map stacks (phone layout)

interface Props {
  stories: NewsStory[];
  idx: Map<string, ReactionSeries>;
  prints: Map<string, CalendarEvent[]>;
  mine: Mine;
  onOpen: (s: NewsStory) => void;
  /** Reports how many stories fit on the map at the current width. */
  onCount?: (n: number) => void;
}

const tone = (score: number) => (isHot(score) ? 'hot' : score >= 60 ? 'mid' : 'low');

export default function StoryMap({ stories, idx, prints, mine, onOpen, onCount }: Props) {
  const [ref, { w }] = useSize<HTMLDivElement>();
  const wide = w >= WIDE;
  const H = wide ? 600 : 0;
  const rest = stories.slice(1, wide ? 8 : 5);
  const restH = wide ? H : Math.min(400, Math.max(260, Math.round(w * 0.95)));
  const lay = !w ? { anchorW: 0, tiles: [] as MapTile[] }
    : wide ? layoutMap(rest.map(s => s.score), w, H)
    : { anchorW: w, tiles: layoutTiles(rest.map(s => s.score), w, restH) };
  const { anchorW, tiles } = lay;
  const top = stories[0];
  const shown = w > 0 && top ? 1 + tiles.length : 0;
  useEffect(() => { onCount?.(shown); }, [shown, onCount]);

  return (
    <div ref={ref} className="nw-map" data-testid="news-map">
      {top && w > 0 && (
        wide ? (
          <div className="nw-tm" style={{ height: H }}>
            <Anchor story={top} idx={idx} prints={prints.get(top.id) ?? []} mine={mine} rest={stories.slice(1, 1 + tiles.length)}
              onOpen={onOpen} style={{ left: 0, top: 0, width: anchorW - 3, height: H }} chart />
            {tiles.map((t, i) => (
              <Tile key={rest[i]!.id} story={rest[i]!} tile={t} rank={i + 2} idx={idx} mine={mine} onOpen={onOpen}
                style={{ left: anchorW + t.rect.x, top: t.rect.y, width: t.rect.w - 3, height: t.rect.h - 3 }} />
            ))}
          </div>
        ) : (
          <>
            <Anchor story={top} idx={idx} prints={prints.get(top.id) ?? []} mine={mine} rest={[]} onOpen={onOpen} />
            {tiles.length > 0 && (
              <div className="nw-tm" style={{ height: restH, marginTop: 3 }}>
                {tiles.map((t, i) => (
                  <Tile key={rest[i]!.id} story={rest[i]!} tile={t} rank={i + 2} idx={idx} mine={mine} onOpen={onOpen}
                    style={{ left: t.rect.x, top: t.rect.y, width: t.rect.w - 3, height: t.rect.h - 3 }} />
                ))}
              </div>
            )}
          </>
        )
      )}
    </div>
  );
}

function Meta({ s, full }: { s: NewsStory; full: boolean }) {
  return (
    <div className="nw-meta">
      <span className="nw-sc num" title={s.scoreSource === 'rules' ? 'Rules score until TRADElogs AI scores it' : 'TRADElogs AI score'}>{s.score}</span>
      <span className="num">{hhmm(s.publishedAt)}</span>
      {full && s.desk && <span className="nw-ell">{DESK_LABEL[s.desk]}</span>}
      {full && <span className="num">{s.sourceCount} src</span>}
    </div>
  );
}

function Anchor({ story: s, idx, prints, mine, rest, onOpen, style, chart }: {
  story: NewsStory; idx: Map<string, ReactionSeries>; prints: CalendarEvent[]; mine: Mine; rest: NewsStory[];
  onOpen: (s: NewsStory) => void; style?: React.CSSProperties; chart?: boolean;
}) {
  const moves = storyMoves(s, idx);
  const you = youTag(s, mine);
  const [chRef, ch] = useSize<HTMLDivElement>();
  const t0 = Date.parse(s.publishedAt);
  const youKey = you?.kind === 'open' ? you.symbol : null;
  const lines: ChartLine[] = moves
    .filter(m => m.unit === 'pct')
    .slice(0, 4)
    .map((m, i) => ({ key: m.key, series: idx.get(m.key)!, you: youKey ? m.key === youKey : i === 0 }));
  const pins = [{ at: t0, n: 1, hot: isHot(s.score) }, ...rest.map((r, i) => ({ at: Date.parse(r.publishedAt), n: i + 2, hot: isHot(r.score) }))];
  // Big figures: the released prints behind the story, else its two biggest moves.
  const big = prints.length
    ? prints.map(e => ({ v: `${e.actual}${e.unit && !String(e.actual).endsWith(e.unit) ? e.unit : ''}`, k: [e.title, e.forecast ? `F ${e.forecast}` : '', e.previous ? `P ${e.previous}` : ''].filter(Boolean).join(' · ') }))
    : [];

  return (
    <article className={`nw-tile nw-tile--xl nw-tile--${tone(s.score)}${style ? '' : ' nw-tile--block'}`} style={style} data-testid="news-tile-top">
      <div className="nw-meta">
        <span className="num">{hhmm(s.publishedAt)}</span>
        {s.desk && <span>{DESK_LABEL[s.desk]}</span>}
        <span className="num nw-ell">{s.sourceCount > 1 ? `${s.sourceCount} sources merged` : s.source}</span>
        <span className="nw-meta-r">score</span>
        <span className="nw-sc34 num">{s.score}</span>
      </div>
      <h3><button type="button" className="nw-hbtn" onClick={() => onOpen(s)}>{s.title}</button></h3>
      {big.length > 0 && (
        <div className="nw-dat">
          {big.map((b, i) => <div key={i} className="nw-dat-i"><div className="nw-dat-v num">{b.v}</div><div className="nw-dat-k num">{b.k}</div></div>)}
        </div>
      )}
      {chart ? <div ref={chRef} className="nw-chbox">{ch.w > 0 && <ReactionChart w={ch.w} h={ch.h} t0={t0} lines={lines} pins={pins} />}</div> : null}
      {(moves.length > 0 || you) && (
        <div className="nw-mvs nw-mvs--wrap">
          {moves.map(m => <Mv key={m.key} m={m} />)}
          {you && <You>{`${you.kind === 'open' ? 'Open trade' : 'You trade'} · ${you.symbol}`}</You>}
        </div>
      )}
      {s.line && <AiLine n={s.sourceCount} text={s.line} />}
    </article>
  );
}

const LH = { s: 17, m: 17, l: 18 };
function Tile({ story: s, tile, rank, idx, mine, onOpen, style }: {
  story: NewsStory; tile: MapTile; rank: number; idx: Map<string, ReactionSeries>; mine: Mine; onOpen: (s: NewsStory) => void; style: React.CSSProperties;
}) {
  const { size } = tile;
  const h = tile.rect.h - 3;
  const moves = storyMoves(s, idx).slice(0, size === 's' ? 1 : size === 'm' ? 2 : 3);
  const you = size !== 's' ? youTag(s, mine) : null;
  const ai = size === 'l' && s.line ? s.line : null;
  // Lines of headline that fit: tile height minus padding, meta row, moves row, AI line and chip.
  const pad = size === 's' ? 20 : 28;
  const gap = size === 's' ? 4 : 8;
  const mvH = moves.length || (you && size === 'm') ? (size === 'l' ? 30 : 20) + gap : 0;
  const aiH = ai ? 52 + gap : 0;
  const youH = you && size === 'l' ? 20 + gap : 0;
  const lines = Math.max(1, Math.min(size === 'l' ? 4 : 3, Math.floor((h - pad - 16 - gap - mvH - aiH - youH) / LH[size])));
  // Full headline on large tiles when it has room; the AI short title otherwise.
  const title = size === 'l' && lines >= 2 ? s.title : s.short ?? s.title;

  return (
    <article className={`nw-tile nw-tile--${size} nw-tile--${tone(s.score)}`} style={style} data-rank={rank}>
      <Meta s={s} full={size !== 's'} />
      <h3 style={{ WebkitLineClamp: lines }}><button type="button" className="nw-hbtn" onClick={() => onOpen(s)} title={s.title}>{title}</button></h3>
      {ai && <AiLine n={s.sourceCount} text={ai} />}
      {(moves.length > 0 || (you && size === 'm')) && (
        <div className="nw-mvs">
          {moves.map((m, i) => <Mv key={m.key} m={m} big={size === 'l' && i === 0} />)}
          {you && size === 'm' && <You>{you.kind === 'open' ? 'Open trade' : 'You trade'}</You>}
        </div>
      )}
      {you && size === 'l' && <div><You>{`${you.kind === 'open' ? 'Open trade' : 'You trade'} · ${you.symbol}`}</You></div>}
    </article>
  );
}
