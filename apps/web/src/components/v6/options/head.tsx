'use client';

// The options pages' shared bar: sections, the underlying and where the data
// comes from (Delta live, or the testnet when trading on a testnet account).
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { fmtNum, loadCtx, optionsApi, saveCtx, type OptionsCtx, type Underlying } from '@/lib/options-api';

const SECTIONS: Array<[string, string]> = [['/options', 'Chain'], ['/options/overview', 'Overview'], ['/options/charts', 'Charts'], ['/options/builder', 'Builder'], ['/options/replay', 'Replay']];

/** The shared context, loaded from this device once mounted. */
export function useOptionsCtx(): [OptionsCtx | null, (c: OptionsCtx) => void] {
  const [ctx, setCtx] = useState<OptionsCtx | null>(null);
  useEffect(() => { setCtx(loadCtx()); }, []);
  return [ctx, (c: OptionsCtx) => { saveCtx(c); setCtx(c); }];
}

export default function OptionsHead({ ctx, setCtx, spot, right }: { ctx: OptionsCtx; setCtx: (c: OptionsCtx) => void; spot?: number | null; right?: React.ReactNode }) {
  const path = usePathname();
  const [unds, setUnds] = useState<Underlying[] | null>(null);
  useEffect(() => { optionsApi.underlyings(ctx.env).then(setUnds, () => setUnds([])); }, [ctx.env]);
  const live = unds?.find((u) => u.underlying === ctx.underlying)?.spot;
  return (
    <div className="op-head">
      <nav className="x-seg x-seg--in x-seg--sm op-sections" aria-label="Options sections">
        {SECTIONS.map(([href, label]) => <Link key={href} href={href} aria-current={path === href ? 'page' : undefined} className={path === href ? 'is-on' : ''} data-testid={`op-nav-${label.toLowerCase()}`}>{label}</Link>)}
      </nav>
      <div className="op-pick">
        <div className="x-seg x-seg--in x-seg--sm" role="radiogroup" aria-label="Underlying">
          {(unds?.length ? unds.map((u) => u.underlying) : [ctx.underlying]).map((u) => (
            <button key={u} type="button" role="radio" aria-checked={ctx.underlying === u} onClick={() => setCtx({ ...ctx, underlying: u })} data-testid={`op-und-${u}`}>{u}</button>
          ))}
        </div>
        <select className="x-input op-env" value={ctx.env} onChange={(e) => setCtx({ ...ctx, env: e.target.value === 'testnet' ? 'testnet' : 'live' })} aria-label="Data source" data-testid="op-env">
          <option value="live">Delta India</option>
          <option value="testnet">Delta testnet</option>
        </select>
        <span className="op-spot m" data-testid="op-spot">{ctx.underlying} index {fmtNum(spot ?? live ?? null, 2)}</span>
        {right}
      </div>
    </div>
  );
}
