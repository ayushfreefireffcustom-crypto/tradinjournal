'use client';

// The /dev/ui gallery (A2.28): each shared primitive in its states, so a change
// to tokens or components.css can be reviewed in one place, in both themes.
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { IPlus, ISearch, ISync } from '@/components/v6/icons';
import { IEye, IMoonIcon, ISunIcon } from '@/components/v6/frame';
import { useTheme } from '@/components/v6/use-theme';
import { fmtUsd, pnlClass } from '@/lib/format';
import type { CustomRange } from '@/lib/stats';
import DateRangePicker from './date-range';
import Freshness from './freshness';
import IconButton from './icon-button';
import InfoTip from './info-tip';
import Sparkline from './sparkline';
import { useMenu } from './use-menu';
import '@/styles/v6/tokens.css';
import '@/styles/v6/components.css';
import '@/styles/v6/frame.css';
import '@/styles/v6/kit.css';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="x-card dv-sec">
      <div className="x-ch"><div><h2>{title}</h2></div></div>
      <div className="dv-row">{children}</div>
    </section>
  );
}

function MenuDemo() {
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState('Edit');
  const close = useCallback(() => setOpen(false), []);
  const ref = useMenu(open, close);
  return (
    <div className="f-popwrap" ref={ref}>
      <button type="button" className="x-btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)} data-testid="dv-menu">Menu: {pick}</button>
      {open && (
        <div className="x-pop f-pop" role="menu" aria-label="Actions">
          {['Edit', 'Duplicate', 'Delete'].map((x) => (
            <button key={x} type="button" role="menuitem" onClick={() => { setPick(x); close(); }}><span className="f-pop-main"><b>{x}</b></span></button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Gallery() {
  const [theme, toggleTheme] = useTheme();
  const [seg, setSeg] = useState('30D');
  const [tab, setTab] = useState('a');
  const [on, setOn] = useState(true);
  const [range, setRange] = useState<CustomRange | null>(null);
  // Set after mount: a time read during render differs between server and client.
  const [stamp, setStamp] = useState<number | null>(null);
  useEffect(() => { setStamp(Date.now() - 12_000); }, []);
  return (
    <div className="v6 dv">
      <style>{`
        .v6.dv { min-height: 100vh; background: var(--bg); color: var(--tx); padding: 32px 24px 96px; display: grid; gap: 16px; max-width: 1100px; margin: 0 auto; font-family: var(--sans); }
        .v6 .dv-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
        .v6 .dv-sec h2 { font-size: 15px; font-weight: 500; margin: 0; }
        .v6 .dv-row { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
        .v6 .dv-row > .x-strip, .v6 .dv-row > .x-tblwrap, .v6 .dv-row > .x-empty, .v6 .dv-row > .x-banner { flex: 1 1 100%; }
      `}</style>
      <div className="dv-head">
        <div><h1 className="x-h1">UI primitives</h1><p className="x-lead">styles/v6 + components/v6/ui. Development only.</p></div>
        <IconButton label={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'} onClick={toggleTheme} data-testid="dv-theme">
          {theme === 'light' ? <ISunIcon /> : <IMoonIcon />}
        </IconButton>
      </div>

      <Section title="Buttons">
        <button type="button" className="x-btn x-btn--hi">Primary</button>
        <button type="button" className="x-btn">Secondary</button>
        <button type="button" className="x-btn x-btn--ghost">Ghost</button>
        <button type="button" className="x-btn x-btn--danger">Delete</button>
        <button type="button" className="x-btn x-btn--sm"><IPlus size={14} />Small</button>
        <button type="button" className="x-btn x-btn--hi" disabled>Disabled</button>
        <button type="button" className="x-link">Text link</button>
        <IconButton label="Sync now"><ISync size={16} /></IconButton>
        <IconButton label="Hide balances"><IEye /></IconButton>
        <MenuDemo />
      </Section>

      <Section title="Segmented, tabs, tags">
        <div className="x-seg" role="group" aria-label="Range">
          {['7D', '30D', '90D', 'All'].map((x) => <button key={x} type="button" aria-pressed={seg === x} onClick={() => setSeg(x)}>{x}</button>)}
        </div>
        <div className="x-tabs" role="tablist" aria-label="Demo tabs">
          <button type="button" role="tab" aria-selected={tab === 'a'} onClick={() => setTab('a')}>Overview<span className="x-badge">3</span></button>
          <button type="button" role="tab" aria-selected={tab === 'b'} onClick={() => setTab('b')}>Details</button>
        </div>
        <span className="x-tag">Neutral</span><span className="x-tag x-tag--g">Hit</span><span className="x-tag x-tag--r">Stopped</span>
        <span className="x-side x-side--long">Long</span><span className="x-side x-side--short">Short</span>
        <span className="x-mk">XAU</span>
      </Section>

      <Section title="Stats">
        <div className="x-strip" style={{ ['--n' as string]: 4 }}>
          <div className="x-stat"><span>Net P&amp;L<InfoTip what="Everything your closed trades made or lost." why="The bottom line." label="Net P&L" /></span><b className={`m ${pnlClass(1284.5)}`}>{fmtUsd(1284.5, { signed: true })}</b><small>78 trades</small></div>
          <div className="x-stat"><span>Worst day</span><b className={`m ${pnlClass(-312)}`}>{fmtUsd(-312, { signed: true })}</b><small>Tue 21 Oct</small></div>
          <div className="x-stat"><span>Flat</span><b className={`m ${pnlClass(0)}`}>{fmtUsd(0, { signed: true })}</b><small>no sign on zero</small></div>
          <div className="x-stat"><span>Unknown</span><b className="m">{fmtUsd(null as unknown as number)}</b><small>never $0</small></div>
        </div>
        <Sparkline values={[3, 5, 4, 8, 7, 11]} width={120} height={32} label="Rising series" />
        <Sparkline values={[9, 7, 8, 4, 5, 2]} width={120} height={32} area />
        <Sparkline values={[4, -2, 3, -5, -1]} width={120} height={32} zero />
        <Sparkline values={[5, 5, 5]} width={120} height={32} />
        <Sparkline values={[1]} width={120} height={32} />
        <Freshness at={stamp} />
      </Section>

      <Section title="Form">
        <div className="x-field"><label htmlFor="dv-in">Label</label><input id="dv-in" className="x-input" placeholder="Placeholder" /><span className="x-help">Help text under the field.</span></div>
        <div className="x-field"><label htmlFor="dv-sel">Select</label><select id="dv-sel" className="x-select"><option>XAUUSD</option><option>EURUSD</option></select></div>
        <div className="x-field"><label htmlFor="dv-err">With an error</label><input id="dv-err" className="x-input" aria-invalid="true" defaultValue="abc" /><span className="x-err">Enter a number.</span></div>
        <label className="x-search"><ISearch size={16} /><input className="x-input" placeholder="Search" aria-label="Search" /></label>
        <label className="dv-row"><input type="checkbox" className="x-check" defaultChecked /> Checkbox</label>
        <div className="dv-row" role="radiogroup" aria-label="Demo radio">
          <label className="dv-row"><input type="radio" name="dv-r" className="x-radio" defaultChecked /> Close positions</label>
          <label className="dv-row"><input type="radio" name="dv-r" className="x-radio" /> Keep them</label>
        </div>
        <div className="cp-stepper"><button type="button" className="x-btn" aria-label="Less">−</button><input className="x-input m" defaultValue="1.0" aria-label="Multiplier" /><button type="button" className="x-btn" aria-label="More">+</button></div>
        <button type="button" className="x-switch" role="switch" aria-checked={on} onClick={() => setOn((v) => !v)} aria-label="Demo switch" />
        <textarea className="x-textarea" placeholder="Notes" rows={2} />
        <DateRangePicker value={range} onChange={setRange} />
      </Section>

      <Section title="States">
        <div className="x-banner" role="status">An info banner: one sentence.</div>
        <div className="x-banner x-banner--ok" role="status">Saved.</div>
        <div className="x-banner x-banner--err" role="alert">Broker bridge unavailable. Try again in a minute.</div>
        <div className="x-empty"><b>No trades yet</b><p>Connect MT5 and your closed trades show up here.</p><button type="button" className="x-btn x-btn--hi">Connect MT5</button></div>
        <span className="x-skel" style={{ width: 160, height: 14 }} /><span className="x-skel" style={{ width: 90, height: 28 }} />
      </Section>

      <Section title="Table">
        <div className="x-tblwrap">
          <table className="x-tbl">
            <thead><tr><th>Symbol</th><th>Side</th><th className="x-r">Net</th></tr></thead>
            <tbody>
              <tr><td>XAUUSD</td><td><span className="x-side x-side--long">Long</span></td><td className={`x-r m ${pnlClass(42.1)}`}>{fmtUsd(42.1, { signed: true })}</td></tr>
              <tr><td>NAS100</td><td><span className="x-side x-side--short">Short</span></td><td className={`x-r m ${pnlClass(-18)}`}>{fmtUsd(-18, { signed: true })}</td></tr>
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}
