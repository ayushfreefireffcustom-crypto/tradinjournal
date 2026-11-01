'use client';

import { useCountUp } from '@/hooks/use-count-up';
import type { MacroState } from '@/lib/macro-api';
import { deltaPct, formatIndicatorValue, formatSignedPct } from '@/lib/macro-format';
import { PanelHead } from '@/components/v6/macro/ui';
import Sparkline from '@/components/v6/ui/sparkline';

function pick(macro: MacroState['macro'], key: string) {
  return macro.find(m => m.key === key) ?? null;
}

function AnimatedValue({ value, unit }: { value: number; unit: string | null | undefined }) {
  const n = useCountUp(value, { duration: 1000, decimals: 2 });
  return <>{formatIndicatorValue(n ?? value, unit)}</>;
}

function Metric({ label, row, hint }: { label: string; row: MacroState['macro'][number] | null; hint?: string }) {
  const d = row ? deltaPct(row.value, row.prev) : null;
  return (
    <article className="x-card mc-lq">
      <div className="x-stat">
        <span className="l">{label}</span>
        <b>{row ? <AnimatedValue value={row.value} unit={row.unit} /> : '—'}</b>
        <small className="mc-lq-h"><span>{hint ?? row?.label ?? '—'}</span>{d != null && <span className={`m ${d > 0 ? 'pos' : d < 0 ? 'neg' : ''}`}>{formatSignedPct(d, 1)}</span>}</small>
      </div>
      {row?.history && row.history.length >= 2 && <div className="mc-lq-s"><Sparkline values={row.history} width={120} height={32} fluid /></div>}
    </article>
  );
}

/** Net liquidity and banking stress console. */
export default function LiquidityConsole({ macro }: { macro: MacroState['macro'] }) {
  const net = pick(macro, 'NET_LIQUIDITY');
  const walcl = pick(macro, 'WALCL');
  const rrp = pick(macro, 'RRPONTSYD');
  const tga = pick(macro, 'WTREGEN');
  const nfci = pick(macro, 'NFCI');
  const hy = pick(macro, 'BAMLH0A0HYM2');
  const vix = pick(macro, 'VIXCLS');

  const stress =
    (nfci && nfci.value > 0 ? 1 : 0) +
    (hy && hy.prev != null && hy.value > hy.prev ? 1 : 0) +
    (vix && vix.value >= 20 ? 1 : 0);
  const [label, tag] = stress >= 2 ? ['elevated', 'x-tag x-tag--r'] : stress === 1 ? ['watch', 'x-tag'] : ['calm', 'x-tag x-tag--g'];

  return (
    <div className="mc-stack" data-testid="macro-liquidity-console">
      <PanelHead eyebrow="Banking & liquidity" title="Net liquidity console" right={<span className={tag}>Stress: {label}</span>}
        lead="Net liquidity = Fed balance sheet − TGA − reverse repo. Expanding liquidity has historically supported risk assets; draining it tightens financial conditions." />
      <div className="mc-g4">
        <Metric label="Net liquidity" row={net} hint="WALCL − TGA − RRP" />
        <Metric label="Fed balance sheet" row={walcl} />
        <Metric label="TGA" row={tga} hint="Treasury General Account" />
        <Metric label="ON RRP" row={rrp} hint="Reverse repo facility" />
      </div>
      <div className="mc-g3">
        <Metric label="NFCI" row={nfci} hint="Chicago Fed conditions (− = loose)" />
        <Metric label="HY OAS" row={hy} hint="High-yield credit spread" />
        <Metric label="VIX" row={vix} hint="Equity vol / risk appetite" />
      </div>
    </div>
  );
}
