'use client';

// Process grade with its reasons, and the "similar trades" stat. Shared by the
// trade-log side panel and (if it wants) the full trade review. The grade
// counts rule flags before/at entry, not the result (see insights/compute.ts).
import type { Grade, TlReason, TlSimilar } from '@/lib/tradelog-v2-api';
import { gradeTone } from '@/lib/tradelog-v2-api';
import { kmoney, tone } from '@/lib/dashboard-v2-format';

export function GradeBox({ grade, size = 'sm', title }: { grade: Grade | null; size?: 'sm' | 'lg'; title?: string }) {
  if (!grade) return <span className="tl-gd none" title={title ?? 'Grades need 20 closed trades'}>–</span>;
  return <span className={`tl-gd ${gradeTone(grade)} ${size}`} title={title ?? `Process grade ${grade}`}>{grade}</span>;
}

export function GradeVerdict({ grade, reasons, graded, minTrades = 20 }: { grade: Grade | null; reasons: TlReason[]; graded: boolean; minTrades?: number }) {
  if (!graded) return <p className="tl-muted" data-testid="verdict-none">Process grades start at {minTrades} closed trades.</p>;
  if (!grade) return <p className="tl-muted" data-testid="verdict-open">Graded once the position closes.</p>;
  return (
    <div className="tl-verdict" data-testid="verdict">
      <span className={`tl-big-grade ${gradeTone(grade)}`} aria-label={`Grade ${grade}`}>{grade}</span>
      <div className="tl-reasons">
        {reasons.length ? reasons.map(r => <span key={r.key} className="tl-reason" title={r.detail}>{r.label}</span>)
          : <span className="tl-reason ok">Every rule kept</span>}
      </div>
    </div>
  );
}

export function SimilarStat({ similar, onShow }: { similar: TlSimilar | null; onShow?: () => void }) {
  if (!similar) return null;
  const shown = similar.results;
  return (
    <div className="tl-sim" data-testid="similar">
      <div className="tl-sim-h">
        <b>{similar.n} similar trade{similar.n === 1 ? '' : 's'}</b>
        <span className="tl-sim-dots" aria-hidden>{shown.map((v, i) => <i key={i} className={v > 0 ? 'w' : 'l'} />)}</span>
        <b className={`tl-sim-r ${tone(similar.net)}`}>{similar.wins} won · {kmoney(similar.net)}</b>
      </div>
      <small>{similar.criteria.join(' · ')}{shown.length < similar.n ? ` · dots: last ${shown.length}` : ''}{onShow && <> · <button type="button" className="tl-link" onClick={onShow}>Show</button></>}</small>
    </div>
  );
}
