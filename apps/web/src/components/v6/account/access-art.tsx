'use client';

// Drawn pieces for the trader's Partner access page. The idea (after freedisk.space):
// every section holds a small, honest render of the real screen — real rows, real
// numbers, a pointer resting on the thing you'd press — sitting in a soft "well" and
// cropped by the card edge like a window you're looking into. No icon circles, no
// glow, no badges for the sake of it.
import type { ReactNode } from 'react';
import { Check, LockSimple, X } from '@phosphor-icons/react';

/** Soft tinted well that holds a vignette and crops it at the bottom. */
export function Well({ children, className = '', tall = false }: { children: ReactNode; className?: string; tall?: boolean }) {
  return <div className={`axw ${tall ? 'axw--tall' : ''} ${className}`} aria-hidden>{children}</div>;
}

/** A small app window: three dots, a title, something on the right. */
export function Win({ title, right, children, className = '', url }: { title?: ReactNode; right?: ReactNode; children: ReactNode; className?: string; url?: ReactNode }) {
  return (
    <div className={`axwin ${className}`}>
      <div className="axwin-h">
        <span className="axwin-dots"><i /><i /><i /></span>
        {url ? <span className="axwin-url">{url}</span> : <b className="axwin-t">{title}</b>}
        {right && <span className="axwin-r">{right}</span>}
      </div>
      {children}
    </div>
  );
}

/** macOS-style pointer, drawn. */
export function Cursor({ className = '' }: { className?: string }) {
  return (
    <svg className={`axcur ${className}`} width="18" height="22" viewBox="0 0 18 22" aria-hidden>
      <path d="M2 1.5 L2 17.5 L6.2 13.6 L8.9 20 L11.6 18.8 L8.9 12.6 L14.6 12.6 Z" />
    </svg>
  );
}

/** "● Your real data" style caption under a vignette. */
export function Caption({ children, live = false }: { children: ReactNode; live?: boolean }) {
  return <p className={`axcap ${live ? 'is-live' : ''}`}><i />{children}</p>;
}

export function Box({ on }: { on: boolean }) {
  return <span className={`axbox ${on ? 'on' : ''}`}>{on && <Check size={11} weight="bold" />}</span>;
}

const initials = (n: string) => n.replace(/\(.*\)/, '').split(/\s+/).filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase();

export type LookupState = 'idle' | 'typing' | 'checking' | 'found' | 'missing' | 'linked';

/** Hero vignette: the referral link in a browser bar, typing what the trader types. */
export function LinkPreview({ code, state, name }: { code: string; state: LookupState; name?: string | null }) {
  const typing = state === 'idle' || state === 'typing';
  return (
    <Well tall className="axw-hero">
      <div data-testid="access-ticket" className={`axlp is-${state}`}>
        <Win className="axwin--hero" url={<>tradelogs.com/r/<b className={code ? '' : 'ph'}>{code || 'code'}</b>{typing && <i className="axcaret" />}</>}>
          <div className="axlp-body">
            {(state === 'found' || state === 'linked') && name ? (
              <div className="axlp-card">
                <span className="axav">{initials(name)}</span>
                <span className="axlp-who"><b>{name}</b><small>Partner on TRADElogs</small></span>
                {state === 'linked'
                  ? <span className="axchip ok"><Check size={11} weight="bold" />Linked</span>
                  : <span className="axlp-cta">Link<Cursor className="axcur--cta" /></span>}
              </div>
            ) : state === 'missing' ? (
              <div className="axlp-card is-miss">
                <span className="axav ghost"><X size={14} weight="bold" /></span>
                <span className="axlp-who"><b>No partner uses this code</b><small>Check the spelling with whoever sent you</small></span>
              </div>
            ) : (
              <div className={`axlp-card is-ghost ${state === 'checking' ? 'is-busy' : ''}`}>
                <span className="axav ghost" />
                <span className="axlp-who"><i className="axline w60" /><i className="axline w40" /></span>
              </div>
            )}
            <div className="axlp-rows">
              <span><i className="axline w70" /></span>
              <span><i className="axline w50" /></span>
              <span><i className="axline w80" /></span>
            </div>
          </div>
        </Win>
      </div>
    </Well>
  );
}

export interface PathRow { key: string; title: string; note: string; value: ReactNode; done: boolean; bar?: number }

/** Checklist window: the real steps, ticked when done, with a dark "Next" bar. */
export function PathList({ title, rows, next, action }: { title: string; rows: PathRow[]; next: string | null; action?: ReactNode }) {
  const done = rows.filter(r => r.done).length;
  return (
    <Win title={title} right={<span className="axnum">{done} of {rows.length}</span>} className="axwin--path">
      <ul className="axpath" data-testid="access-journey">
        {rows.map(r => (
          <li key={r.key} className={`ax-st ${r.done ? 'done is-done' : ''}`} data-testid={`access-step-${r.key}`}>
            <Box on={r.done} />
            <span className="axpath-t"><b>{r.title}</b><small>{r.note}</small></span>
            <span className="axpath-v">
              <span className="axnum">{r.value}</span>
              {r.bar !== undefined && <span className="axbar"><i style={{ width: `${Math.round(Math.min(1, Math.max(0, r.bar)) * 100)}%` }} /></span>}
            </span>
          </li>
        ))}
      </ul>
      <div className={`axpath-f ${next ? '' : 'is-done'}`}>
        <span>{next ? <>Next <b>{next}</b></> : <><Check size={13} weight="bold" /> Everything is in place</>}</span>
        {action}
      </div>
    </Win>
  );
}

// ── Three "how it works" vignettes (demo names, labelled as such) ──────────────

export function VSignup() {
  return (
    <Well>
      <Win title="Create your account" className="axwin--card">
        <div className="axform">
          <label><span>Email</span><i className="axfield"><i className="axline w60" /></i></label>
          <label><span>Partner code</span><i className="axfield is-on">MAYA<i className="axcaret" /></i></label>
          <p className="axok"><Check size={11} weight="bold" />Maya R. · partner</p>
        </div>
      </Win>
    </Well>
  );
}

export function VMatch() {
  const rows = [['5110 2847', ''], ['5110 3391', ''], ['5119 0039', 'match'], ['5120 7713', '']];
  return (
    <Well>
      <Win title="Maya’s Elefin client list" right={<span className="axnum">4 accounts</span>} className="axwin--card">
        <ul className="axrows">
          {rows.map(([n, m]) => (
            <li key={n} className={m ? 'is-match' : ''}>
              <span className="axnum">{n}</span><span className="axmute">Elefin-Trade</span>
              {m ? <span className="axchip ok"><Check size={11} weight="bold" />yours</span> : <span className="axmute">·</span>}
            </li>
          ))}
        </ul>
        <Cursor className="axcur--match" />
      </Win>
    </Well>
  );
}

export function VUnlock() {
  const rows = ['Screener', 'Trend checklist', 'Macro desk'];
  return (
    <Well>
      <Win title="Maya’s Pro pack" right={<span className="axchip ok"><Check size={11} weight="bold" />Unlocked</span>} className="axwin--card">
        <ul className="axrows">
          {rows.map((r, i) => (
            <li key={r}><span>{r}</span><span className="axmute">{i === 1 ? 'Guide' : 'Feature'}</span><span className={`axbtn ${i === 0 ? 'is-hover' : ''}`}>Open</span></li>
          ))}
        </ul>
        <Cursor className="axcur--open" />
      </Win>
    </Well>
  );
}

/** The trader's own row as it shows in their partner's client list. */
export function PartnerRowPreview({ partner, name, place, verified, trades, shared }: {
  partner: string | null; name: string; place: string; verified: boolean; trades: number; shared: boolean;
}) {
  return (
    <Well>
      <Win title={partner ? `${partner}’s client list` : 'A partner’s client list'} right={<span className="axmute">as they see it</span>} className="axwin--table">
        <div className="axtbl" role="presentation">
          <div className="axtbl-h"><span>Client</span><span>Broker check</span><span className="n">Trades · 30d</span><span className="n">P&amp;L · 30d</span></div>
          <div className="axtbl-r is-you">
            <span className="axtbl-who"><span className="axav sm">{initials(name || 'You')}</span><span><b>{name || 'You'}</b><small>{place || 'Your city'}</small></span></span>
            <span>{verified ? <span className="axchip ok"><Check size={11} weight="bold" />Verified</span> : <span className="axchip">Not checked</span>}</span>
            <span className="n axnum">{trades}</span>
            <span className="n">{shared ? <span className="axchip ok">Shown</span> : <span className="axmute axlock"><LockSimple size={12} weight="bold" />Private</span>}</span>
          </div>
          <div className="axtbl-r ghost"><span className="axtbl-who"><span className="axav sm ghost" /><i className="axline w50" /></span><i className="axline w40" /><i className="axline w20 n" /><i className="axline w30 n" /></div>
        </div>
      </Win>
    </Well>
  );
}

// ── Partner tool: where you'll use it ─────────────────────────────────────────

const PLACE: Record<string, { app: string; action: string }> = {
  TradingView: { app: 'Pine Editor', action: 'Add to chart' },
  MT5: { app: 'MetaEditor 5', action: 'Compile' },
  MT4: { app: 'MetaEditor 4', action: 'Compile' },
  TRADElogs: { app: 'TRADElogs', action: 'Use' },
};

/** Mini window of the app the tool goes into, with its first lines and the action. */
export function ToolPreview({ name, platform, content, fileName, url, isGuide }: {
  name: string; platform: string | null; content: string | null; fileName: string | null; url: string | null; isGuide: boolean;
}) {
  const base = isGuide && !content ? { app: 'Guide', action: 'Open' } : PLACE[platform ?? ''] ?? { app: 'Preview', action: 'Copy' };
  // A ready-made file (an .ex5, a template) is attached, not compiled or pasted.
  const place = !content && fileName && !isGuide ? { app: base.app, action: 'Attach to chart' } : base;
  const lines = (content ?? '').split('\n').slice(0, 9);
  return (
    <Well tall className="axw-tool">
      <Win title={place.app} right={<span className="axlp-cta axtool-cta">{place.action}<Cursor className="axcur--cta" /></span>} className="axwin--tool">
        {content ? (
          <ol className="axcode">{lines.map((l, i) => <li key={i}><span>{l || ' '}</span></li>)}</ol>
        ) : fileName ? (
          <ul className="axrows"><li><b>{fileName}</b><span className="axmute">{name}</span><span className="axmute">ready</span></li><li><i className="axline w60" /><span /><span /></li><li><i className="axline w40" /><span /><span /></li></ul>
        ) : url ? (
          <div className="axform"><i className="axfield is-on" style={{ letterSpacing: 0, fontWeight: 600 }}>{url.replace(/^https?:\/\//, '').slice(0, 48)}</i><i className="axline w70" /><i className="axline w50" /><i className="axline w60" /></div>
        ) : <div className="axform"><i className="axline w70" /><i className="axline w50" /></div>}
      </Win>
    </Well>
  );
}
