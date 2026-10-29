import { IconTile, Sample } from '../ui';
import { Ic } from '../icons';

// AI coach + SignalX: a conversation stack over a giant ghosted "Coach",
// with a tiny chart inside the answer and a SignalX levels card. Canvas 560×400.

export default function CoachArt() {
  return (
    <>
      <div aria-hidden style={{
        position: 'absolute', left: -10, right: -10, bottom: -58, textAlign: 'center', font: '500 196px/1 var(--sans)', letterSpacing: '-.06em',
        background: 'linear-gradient(180deg,rgba(61,226,150,.5),rgba(8,196,101,.05) 78%)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
      }}>Coach</div>
      <div aria-hidden style={{ position: 'absolute', left: 120, top: 120, width: 340, height: 200, borderRadius: '50%', background: 'radial-gradient(rgba(8,196,101,.25),transparent 70%)', filter: 'blur(20px)' }} />
      <Sample style={{ right: 16, top: 16 }} />

      {/* earlier question, faded back */}
      <div className="chip dim" style={{ left: 66, top: 26, padding: '10px 14px', borderRadius: 16, whiteSpace: 'normal', width: 246 }}>Which symbol costs me the most?</div>

      {/* question */}
      <div className="bub-q" style={{ left: 170, top: 70, width: 282 }}>What’s the one thing I should fix this week?</div>
      <span aria-hidden style={{ position: 'absolute', left: 462, top: 86, width: 26, height: 26, borderRadius: '50%', background: 'linear-gradient(180deg,#3A3A40,#232327)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,.18)', display: 'grid', placeItems: 'center', font: '500 11px/1 var(--sans)', color: '#EDEDEF', zIndex: 4 }}>A</span>

      {/* answer */}
      <div className="bub-a" style={{ left: 50, top: 136, width: 380 }}>
        <div className="who"><IconTile icon="chat" size="xs" />TRADElogs coach · read 78 of your trades</div>
        Trades opened <b style={{ fontWeight: 500, color: '#fff' }}>after 15:00 London</b> are the leak.
        <svg width="346" height="58" viewBox="0 0 346 58" style={{ display: 'block', marginTop: 10 }} aria-hidden>
          <text x="0" y="14" fontSize="11" fill="#8FD9B4">Before 12:00</text>
          <rect x="92" y="5" width="214" height="12" rx="6" fill="#fff" fillOpacity=".08" />
          <rect x="92" y="5" width="137" height="12" rx="6" fill="#08C465" />
          <text x="346" y="15" textAnchor="end" style={{ fontFamily: 'var(--mono)' }} fontSize="11" fill="#3DE296">64%</text>
          <text x="0" y="44" fontSize="11" fill="#8FD9B4">After 15:00</text>
          <rect x="92" y="35" width="214" height="12" rx="6" fill="#fff" fillOpacity=".08" />
          <rect x="92" y="35" width="66" height="12" rx="6" fill="#FE3A31" />
          <text x="346" y="45" textAnchor="end" style={{ fontFamily: 'var(--mono)' }} fontSize="11" fill="#FF8A82">31%</text>
        </svg>
        <div className="fix"><Ic name="check" size={13} stroke={2.2} />Suggestion: no new entries after 15:00</div>
      </div>

      <div className="typing" style={{ left: 50, top: 330 }} aria-hidden><i /><i /><i /></div>

      {/* SignalX card with a tiny levels chart */}
      <div className="chip" style={{ left: 224, top: 304, padding: '11px 14px 11px 11px', gap: 12 }}>
        <IconTile icon="signal" size="sm" />
        <div>SignalX · XAUUSD 1h<small>Bias bullish · levels <span className="num">2,368</span> / <span className="num">2,402</span></small></div>
        <svg width="70" height="34" viewBox="0 0 70 34" style={{ marginLeft: 4 }} aria-hidden>
          <line x1="0" x2="70" y1="7" y2="7" stroke="#3DE296" strokeDasharray="3 3" strokeOpacity=".8" />
          <line x1="0" x2="70" y1="27" y2="27" stroke="#FF7A70" strokeDasharray="3 3" strokeOpacity=".7" />
          <polyline points="2,24 10,21 17,23 25,17 33,19 41,13 49,15 57,10 66,9" fill="none" stroke="#EDEDEF" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
          <circle cx="66" cy="9" r="2.6" fill="#3DE296" />
        </svg>
      </div>
    </>
  );
}
