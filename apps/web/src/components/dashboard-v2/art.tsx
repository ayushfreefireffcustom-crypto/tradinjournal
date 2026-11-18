// Still, drawn pictures for the dashboard (no motion, nothing floating). Colours come from
// the --art-* tokens in dashboard-v2.css so they hold in the light theme too.

/** Yesterday's trades as a small stack of cards; the ones that broke a rule carry a red flag. */
export function ReviewArt({ flagged = 2 }: { flagged?: number }) {
  return (
    <svg viewBox="0 0 236 132" className="d2-art" aria-hidden>
      <ellipse cx="152" cy="119" rx="70" ry="6" fill="var(--art-shadow)" />
      <g transform="rotate(-8 152 74)">
        {flagged >= 2 && <rect x="112" y="22" width="16" height="14" rx="3" fill="var(--d2-r)" />}
        <rect x="100" y="30" width="104" height="74" rx="12" fill="var(--art-paper-3)" stroke="var(--art-edge-3)" />
      </g>
      <g transform="rotate(5 152 74)">
        {flagged >= 1 && <rect x="178" y="26" width="16" height="14" rx="3" fill="var(--d2-r)" />}
        <rect x="100" y="33" width="106" height="74" rx="12" fill="var(--art-paper-2)" stroke="var(--art-edge-2)" />
      </g>
      <rect x="96" y="38" width="112" height="78" rx="13" fill="var(--art-paper)" stroke="var(--art-edge)" />
      <rect x="108" y="50" width="26" height="7" rx="3.5" fill="var(--art-ink)" />
      <rect x="138" y="50" width="16" height="7" rx="3.5" fill="var(--d2-g)" opacity=".4" />
      <path d="M114 68v26M126 72v20M138 66v22M150 76v18M162 62v24" stroke="var(--art-wick)" strokeWidth="1.4" strokeLinecap="round" />
      <rect x="111.5" y="72" width="5" height="14" rx="1.2" fill="var(--d2-g)" />
      <rect x="123.5" y="76" width="5" height="10" rx="1.2" fill="var(--d2-r)" />
      <rect x="135.5" y="70" width="5" height="12" rx="1.2" fill="var(--d2-g)" />
      <rect x="147.5" y="79" width="5" height="9" rx="1.2" fill="var(--d2-r)" />
      <rect x="159.5" y="66" width="5" height="14" rx="1.2" fill="var(--d2-g)" />
      <rect x="174" y="70" width="24" height="5" rx="2.5" fill="var(--art-line)" />
      <rect x="174" y="80" width="18" height="5" rx="2.5" fill="var(--art-line)" />
      <rect x="174" y="90" width="22" height="5" rx="2.5" fill="var(--art-line)" />
    </svg>
  );
}

/**
 * Your MT5 terminal cabled into the journal. `waiting`: connected, but the journal's rows are
 * still empty and the terminal holds an open position (dashed line) that hasn't closed yet.
 */
export function ConnectArt({ waiting = false }: { waiting?: boolean }) {
  return (
    <svg viewBox="0 0 320 172" className="d2-art" aria-hidden>
      <ellipse cx="160" cy="158" rx="132" ry="7" fill="var(--art-shadow)" />
      {/* terminal */}
      <rect x="22" y="34" width="132" height="104" rx="14" fill="var(--art-paper)" stroke="var(--art-edge)" />
      <rect x="34" y="46" width="30" height="7" rx="3.5" fill="var(--art-ink)" />
      <rect x="68" y="46" width="18" height="7" rx="3.5" fill="var(--art-line)" />
      <path d="M44 74v34M60 80v24M76 70v30M92 84v22M108 66v30M124 76v22" stroke="var(--art-wick)" strokeWidth="1.4" strokeLinecap="round" />
      <rect x="41.5" y="80" width="5" height="20" rx="1.2" fill="var(--d2-g)" />
      <rect x="57.5" y="86" width="5" height="12" rx="1.2" fill="var(--d2-r)" />
      <rect x="73.5" y="76" width="5" height="16" rx="1.2" fill="var(--d2-g)" />
      <rect x="89.5" y="88" width="5" height="12" rx="1.2" fill="var(--d2-r)" />
      <rect x="105.5" y="72" width="5" height="18" rx="1.2" fill="var(--d2-g)" />
      <rect x="121.5" y="80" width="5" height="12" rx="1.2" fill="var(--d2-g)" />
      {waiting && <path d="M34 92h108" stroke="var(--art-ink)" strokeOpacity=".55" strokeDasharray="3 4" />}
      {/* cable */}
      <path d="M154 112c14 0 16 22 30 22h6" fill="none" stroke="var(--art-wick)" strokeWidth="3" strokeLinecap="round" />
      <rect x="188" y="127" width="12" height="14" rx="3" fill="var(--art-paper-2)" stroke="var(--art-edge)" />
      {/* journal */}
      <rect x="196" y="46" width="104" height="92" rx="14" fill="var(--art-paper)" stroke="var(--art-edge)" />
      <rect x="208" y="58" width="34" height="7" rx="3.5" fill="var(--art-ink)" />
      {waiting ? (
        <>
          <rect x="208.5" y="76.5" width="79" height="13" rx="6.5" fill="none" stroke="var(--art-line)" strokeDasharray="3 3" />
          <rect x="208.5" y="96.5" width="79" height="13" rx="6.5" fill="none" stroke="var(--art-line)" strokeDasharray="3 3" />
          <rect x="208.5" y="116.5" width="79" height="13" rx="6.5" fill="none" stroke="var(--art-line)" strokeDasharray="3 3" />
        </>
      ) : (
        <>
          <circle cx="214" cy="83" r="3" fill="var(--d2-g)" /><rect x="222" y="80" width="40" height="6" rx="3" fill="var(--art-line)" /><rect x="270" y="80" width="18" height="6" rx="3" fill="var(--d2-g)" opacity=".55" />
          <circle cx="214" cy="103" r="3" fill="var(--d2-r)" /><rect x="222" y="100" width="34" height="6" rx="3" fill="var(--art-line)" /><rect x="272" y="100" width="16" height="6" rx="3" fill="var(--d2-r)" opacity=".55" />
          <circle cx="214" cy="123" r="3" fill="var(--d2-g)" /><rect x="222" y="120" width="44" height="6" rx="3" fill="var(--art-line)" /><rect x="268" y="120" width="20" height="6" rx="3" fill="var(--d2-g)" opacity=".55" />
        </>
      )}
    </svg>
  );
}

/** The chart lost its line where the connection dropped; the cable is pulled out beside it. */
export function ErrorArt() {
  return (
    <svg viewBox="0 0 320 210" className="d2-art" aria-hidden>
      <ellipse cx="156" cy="178" rx="116" ry="7" fill="var(--art-shadow)" />
      <rect x="40" y="54" width="180" height="118" rx="16" fill="var(--art-paper)" stroke="var(--art-edge)" />
      <rect x="56" y="70" width="44" height="7" rx="3.5" fill="var(--art-ink)" />
      <path d="M56 148c8-3 12-12 18-11s8 9 15 6 8-14 14-16" fill="none" stroke="var(--art-ink)" strokeWidth="2" strokeLinecap="round" />
      <path d="M110 122l6 6-4 4 7 6" fill="none" stroke="var(--d2-r)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M130 108l-4 7 5 3-3 7" fill="none" stroke="var(--d2-r)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M140 112c6-4 9 6 15 2s8-16 15-18 9 6 16 0" fill="none" stroke="var(--art-wick)" strokeWidth="2" strokeLinecap="round" strokeDasharray="3 5" />
      <path d="M220 140h10" stroke="var(--art-wick)" strokeWidth="2.4" strokeLinecap="round" />
      <rect x="230" y="131" width="20" height="18" rx="5" fill="var(--art-paper-2)" stroke="var(--art-wick)" strokeWidth="1.6" />
      <path d="M250 136h6M250 144h6" stroke="var(--art-wick)" strokeWidth="2" strokeLinecap="round" />
      <path d="M264 130l3-4M265 140h5M264 150l3 4" stroke="var(--d2-r)" strokeWidth="1.8" strokeLinecap="round" />
      <rect x="276" y="131" width="20" height="18" rx="5" fill="var(--art-paper-2)" stroke="var(--art-wick)" strokeWidth="1.6" />
      <path d="M296 140c8 0 10 8 10 18v16" fill="none" stroke="var(--art-wick)" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

/** A timeline of your trades with the selected window drawn over a stretch that has none. */
export function EmptyViewArt() {
  const left = [[18, 70, 'g'], [30, 58, 'r'], [42, 64, 'g'], [54, 50, 'g']] as const;
  const right = [[164, 54, 'r'], [176, 62, 'g'], [188, 46, 'g']] as const;
  return (
    <svg viewBox="0 0 206 120" className="d2-art" aria-hidden>
      <ellipse cx="103" cy="110" rx="86" ry="5" fill="var(--art-shadow)" />
      <path d="M8 92h190" stroke="var(--art-line)" strokeWidth="1.5" strokeLinecap="round" />
      {[...left, ...right].map(([x, y, c], i) => (
        <g key={i}>
          <path d={`M${x} 92V${y}`} stroke="var(--art-wick)" strokeWidth="1.2" />
          <circle cx={x} cy={y} r="3.6" fill={c === 'g' ? 'var(--d2-g)' : 'var(--d2-r)'} />
        </g>
      ))}
      <rect x="70" y="24" width="80" height="78" rx="12" fill="var(--art-paper)" fillOpacity=".55" stroke="var(--art-ink)" strokeOpacity=".5" strokeDasharray="4 4" />
      <path d="M82 92h56" stroke="var(--art-edge)" strokeWidth="1.5" strokeDasharray="2 5" strokeLinecap="round" />
      <rect x="92" y="36" width="36" height="7" rx="3.5" fill="var(--art-line)" />
    </svg>
  );
}

/** Your screen with a flat, waiting line, and the signal beside it with its outer bars gone. */
export function OfflineArt() {
  return (
    <svg viewBox="0 0 320 210" className="d2-art" aria-hidden>
      <ellipse cx="160" cy="178" rx="116" ry="7" fill="var(--art-shadow)" />
      <rect x="40" y="54" width="170" height="118" rx="16" fill="var(--art-paper)" stroke="var(--art-edge)" />
      <rect x="56" y="70" width="44" height="7" rx="3.5" fill="var(--art-ink)" />
      <path d="M56 136c10-2 14-14 22-12s9 10 16 8" fill="none" stroke="var(--art-ink)" strokeWidth="2" strokeLinecap="round" />
      <path d="M94 132h98" stroke="var(--art-wick)" strokeWidth="2" strokeLinecap="round" strokeDasharray="3 6" />
      <g transform="translate(258 126)" strokeLinecap="round" fill="none">
        <path d="M-30 -14a42 42 0 0 1 60 0" stroke="var(--art-line)" strokeWidth="4" />
        <path d="M-19 -3a27 27 0 0 1 38 0" stroke="var(--art-line)" strokeWidth="4" />
        <path d="M-8 8a12 12 0 0 1 16 0" stroke="var(--art-ink)" strokeWidth="4" />
        <circle cx="0" cy="18" r="3.5" fill="var(--art-ink)" stroke="none" />
        <path d="M-26 -30l52 54" stroke="var(--d2-r)" strokeWidth="3" />
      </g>
    </svg>
  );
}

/** Your dashboard behind a lock: the data's there, it needs you to sign in again. */
export function SessionArt() {
  return (
    <svg viewBox="0 0 320 210" className="d2-art" aria-hidden>
      <ellipse cx="160" cy="178" rx="116" ry="7" fill="var(--art-shadow)" />
      <rect x="56" y="48" width="208" height="124" rx="16" fill="var(--art-paper-2)" stroke="var(--art-edge-2)" />
      <rect x="72" y="64" width="44" height="7" rx="3.5" fill="var(--art-line)" />
      {[0, 1, 2, 3].map(i => <rect key={i} x={72 + i * 46} y="84" width="38" height="26" rx="7" fill="var(--art-paper-3)" stroke="var(--art-edge-3)" />)}
      <path d="M72 150c14-4 20-18 32-16s14 12 26 8 18-22 30-24 18 10 30 4 18-10 30-12" fill="none" stroke="var(--art-wick)" strokeWidth="2" strokeLinecap="round" />
      <g transform="translate(160 118)">
        <path d="M-14 -10v-10a14 14 0 0 1 28 0v10" fill="none" stroke="var(--art-ink)" strokeWidth="5" strokeLinecap="round" />
        <rect x="-24" y="-12" width="48" height="40" rx="9" fill="var(--art-paper)" stroke="var(--art-edge)" />
        <circle cx="0" cy="5" r="5" fill="var(--art-ink)" />
        <rect x="-1.75" y="7" width="3.5" height="10" rx="1.75" fill="var(--art-ink)" />
      </g>
    </svg>
  );
}
