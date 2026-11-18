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
