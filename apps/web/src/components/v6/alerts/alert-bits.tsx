// Small, still pictures for the alerts page: the shape of each ready-made rule, and where an
// alert's indicator sits against its trigger level right now. Nothing moves.
import type { CatalogueItem, IndicatorAlert, WatchRule } from '@/lib/indicator-alerts-api';

const INK = 'var(--mut)', LN = 'var(--line-2)';
const toneOf = (bias: WatchRule['bias']) => (bias === 'bullish' ? 'var(--d2-g)' : bias === 'bearish' ? 'var(--d2-r)' : 'var(--tx)');
type Shape = 'level' | 'lines' | 'band' | 'volume';
const shapeOf = (id: string): Shape =>
  /^bb-/.test(id) ? 'band' : /volume/.test(id) ? 'volume' : /golden|death|ema-|macd|stoch/.test(id) ? 'lines' : 'level';
const isDown = (id: string) => /down|death|overbought/.test(id);

/** The pattern a ready-made rule waits for, with the moment it fires marked. */
export function PatternArt({ rule }: { rule: Pick<WatchRule, 'id' | 'bias'> }) {
  const c = toneOf(rule.bias), shape = shapeOf(rule.id), flip = isDown(rule.id);
  const body = (() => {
    switch (shape) {
      case 'lines': return (
        <>
          <path d="M6 22C50 24 100 28 154 30" fill="none" stroke={INK} strokeWidth="1.6" strokeLinecap="round" />
          <path d="M6 44C40 46 66 40 84 28S124 10 154 8" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" />
          <circle cx="82.5" cy="28.6" r="3.4" fill="var(--tile)" stroke={c} strokeWidth="1.6" />
        </>
      );
      case 'band': return (
        <>
          <path d="M6 14C50 12 100 16 154 13M6 44C50 46 100 42 154 45" fill="none" stroke={INK} strokeWidth="1.3" strokeDasharray="3 3" strokeLinecap="round" />
          <path d="M6 30C30 34 46 24 66 28S100 36 116 24 138 6 154 4" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" />
          <circle cx="129" cy="13.4" r="3.4" fill="var(--tile)" stroke={c} strokeWidth="1.6" />
        </>
      );
      case 'volume': return (
        <>
          {[14, 10, 18, 12, 16, 9, 13, 11, 15, 12, 10].map((h, i) => <rect key={i} x={8 + i * 12} y={50 - h} width="7" height={h} rx="1.5" fill={LN} />)}
          <rect x="140" y="12" width="7" height="38" rx="1.5" fill={c} />
          <path d="M6 34H154" stroke={INK} strokeWidth="1.3" strokeDasharray="3 3" strokeLinecap="round" />
        </>
      );
      default: return (
        <>
          <path d="M6 34H154" stroke={INK} strokeWidth="1.3" strokeDasharray="3 3" strokeLinecap="round" />
          <path d="M6 14C28 18 38 40 56 44S82 44 92 34 124 12 154 10" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" />
          <circle cx="92.2" cy="33.8" r="3.4" fill="var(--tile)" stroke={c} strokeWidth="1.6" />
        </>
      );
    }
  })();
  return (
    <svg viewBox="0 0 160 56" className="ia-pat" aria-hidden>
      {flip && shape !== 'volume' ? <g transform="matrix(1 0 0 -1 0 56)">{body}</g> : body}
    </svg>
  );
}

const num = (v: number) => (Math.abs(v) >= 1000 ? v.toLocaleString('en-US', { maximumFractionDigits: 1 }) : Math.abs(v) >= 1 ? v.toFixed(2) : v.toPrecision(3));

/**
 * Where the indicator closed against the level it's watching. Bounded indicators (RSI, MFI,
 * stochastic: 0 to 100) get a small meter; anything else shows the two numbers and the gap.
 */
export function Proximity({ alert, catalogue }: { alert: IndicatorAlert; catalogue: CatalogueItem[] | null }) {
  if (!alert.lastBarTime || alert.lastLeft == null) return <span className="ia-prox ia-prox--wait">Waiting for a bar close</span>;
  const left = alert.lastLeft;
  const target = alert.right.kind === 'value' ? alert.right.value : alert.lastRight;
  const scale = catalogue?.find(c => c.id === alert.left.id)?.outputs.find(o => o.key === alert.left.output)?.scale;
  const label = alert.right.kind === 'value' ? 'level' : 'vs';
  if (target != null && scale === 'percent' && left >= 0 && left <= 100 && target >= 0 && target <= 100) {
    return (
      <span className="ia-prox" title={`Last close ${num(left)}, level ${num(target)}`}>
        <span className="ia-prox-n"><b className="m">{num(left)}</b><small>{label} {num(target)}</small></span>
        <span className="ia-meter" aria-hidden>
          <i className="ia-meter-t" style={{ left: `${target}%` }} />
          <i className="ia-meter-v" style={{ left: `${left}%` }} />
        </span>
      </span>
    );
  }
  if (target == null) return <span className="ia-prox"><span className="ia-prox-n"><b className="m">{num(left)}</b></span></span>;
  const gap = target !== 0 ? ((left - target) / Math.abs(target)) * 100 : null;
  return (
    <span className="ia-prox">
      <span className="ia-prox-n"><b className="m">{num(left)}</b><small>{label} {num(target)}</small></span>
      {gap != null && Number.isFinite(gap) && <small className="ia-prox-gap">{Math.abs(gap) < 0.05 ? 'At the level' : `${Math.abs(gap).toFixed(gap > -10 && gap < 10 ? 2 : 1)}% ${gap > 0 ? 'above' : 'below'}`}</small>}
    </span>
  );
}

/** "Today", "Yesterday", or the date, for grouping recent alerts. */
export function dayLabel(iso: string): string {
  const d = new Date(iso), now = new Date();
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((start(now) - start(d)) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return d.toLocaleDateString('en-US', { weekday: days < 7 ? 'long' : undefined, day: 'numeric', month: 'short' });
}
