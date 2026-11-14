'use client';

// Cut / hold / hike odds per FOMC meeting from 30-day Fed funds futures (CME
// FedWatch method, computed in @tradinjournal/core fedWatch from CBOT prices).
// Bar per meeting: green = cut, grey = hold, red = hike. "Priced by then" is
// the 25 bp moves priced from now through that meeting, with the change since
// the prior session. The Treasury proxy (cuts-proxy.tsx) is the fallback.
import type { MacroFedWatch } from '@/lib/macro-api';
import { SecHead } from './parts';
import { signed } from './format';
import { cumulativeDelta, cumulativeWord, meetingOutcome, segments } from './cuts-format';
import '@/styles/v6/macro-cuts.css';

const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

export default function CutsByMeeting({ fw }: { fw: MacroFedWatch }) {
  return (
    <div className="mo-fw" data-testid="macro-cuts-meetings">
      <SecHead title="Cuts priced by meeting" sub="from Fed funds futures" />
      <table className="mo-fw-t">
        <colgroup><col className="mo-fw-c-m" /><col /><col className="mo-fw-c-o" /><col className="mo-fw-c-p" /></colgroup>
        <thead>
          <tr>
            <th scope="col">Meeting</th>
            <th scope="col"><span className="mo-fw-k pos">Cut</span> · Hold · <span className="mo-fw-k neg">Hike</span></th>
            <th scope="col" className="mo-fw-r">Odds</th>
            <th scope="col" className="mo-fw-r mo-fw-p">By then</th>
          </tr>
        </thead>
        <tbody>
          {fw.rows.map(r => {
            const o = meetingOutcome(r);
            const s = segments(r);
            const d = cumulativeDelta(r);
            const cum = cumulativeWord(r.cumulativeCuts);
            return (
              <tr key={r.meeting}>
                <th scope="row">{r.label}</th>
                <td>
                  <div className="mo-fw-bar" role="img" aria-label={`${r.label}: ${Math.round(r.cutPct)}% cut, ${Math.round(r.holdPct)}% hold, ${Math.round(r.hikePct)}% hike`}>
                    {s.cut > 0 && <span className="mo-fw-cut" style={{ width: `${s.cut}%` }} />}
                    {s.hold > 0 && <span className="mo-fw-hold" style={{ width: `${s.hold}%` }} />}
                    {s.hike > 0 && <span className="mo-fw-hike" style={{ width: `${s.hike}%` }} />}
                  </div>
                </td>
                <td className="mo-fw-r">
                  <div className={`mo-fw-o m ${o.word === 'cut' ? 'pos' : o.word === 'hike' ? 'neg' : ''}`}>{o.pct}% {o.word}</div>
                  {r.bigMovePct >= 1 && <div className="mo-fw-s m">{Math.round(r.bigMovePct)}% 50bp</div>}
                  <div className="mo-fw-s m mo-fw-p2">{cum}</div>
                </td>
                <td className="mo-fw-r mo-fw-p">
                  <div className="mo-fw-cum m">{cum}</div>
                  {d != null && <div className={`mo-fw-s m ${d > 0 ? 'pos' : 'neg'}`}>{signed(d, 2)} d/d</div>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mo-note m">Implied Fed funds {fw.impliedNow.toFixed(2)}% now. CBOT 30-day futures, {day(fw.asOf)}, CME FedWatch method.</p>
    </div>
  );
}
