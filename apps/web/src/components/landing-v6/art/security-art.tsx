import { Chip, seeded } from '../ui';

// Read-only security: an extruded graphite padlock with a brushed body, metal
// shackle, glowing keyhole and floor reflection, over faint ciphertext rows.
// Canvas 560×400.

function cipherRows() {
  const rnd = seeded(11);
  const hex = '0123456789abcdef';
  return Array.from({ length: 9 }, () => Array.from({ length: 44 }, () => hex[Math.floor(rnd() * 16)]).join(''));
}

export default function SecurityArt() {
  const rows = cipherRows();
  return (
    <>
      <div className="art-dots" style={{ opacity: 0.35 }} />
      <svg width="560" height="400" viewBox="0 0 560 400" style={{ position: 'absolute', inset: 0 }} aria-hidden>
        <defs>
          <linearGradient id="s-sh" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#36363C" /><stop offset=".3" stopColor="#9C9CA6" /><stop offset=".5" stopColor="#F0F0F4" /><stop offset=".62" stopColor="#B4B4BC" /><stop offset=".85" stopColor="#4A4A51" /><stop offset="1" stopColor="#28282D" /></linearGradient>
          <linearGradient id="s-body" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#303036" /><stop offset=".35" stopColor="#17171A" /><stop offset="1" stopColor="#0A0A0B" /></linearGradient>
          <linearGradient id="s-side" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#0E0E10" /><stop offset="1" stopColor="#050506" /></linearGradient>
          <linearGradient id="s-edge" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#fff" stopOpacity=".05" /><stop offset=".5" stopColor="#fff" stopOpacity=".7" /><stop offset="1" stopColor="#fff" stopOpacity=".05" /></linearGradient>
          <radialGradient id="s-hole" cx="50%" cy="40%" r="60%"><stop offset="0" stopColor="#9CFFD0" /><stop offset=".45" stopColor="#08C465" /><stop offset="1" stopColor="#035A2D" /></radialGradient>
          <radialGradient id="s-glow" cx="50%" cy="50%" r="50%"><stop offset="0" stopColor="#fff" stopOpacity=".18" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></radialGradient>
          <linearGradient id="s-refl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fff" stopOpacity=".07" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></linearGradient>
          <linearGradient id="s-cfade" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#fff" stopOpacity="0" /><stop offset=".5" stopColor="#fff" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></linearGradient>
          <mask id="s-cmask"><rect width="560" height="400" fill="url(#s-cfade)" /></mask>
          <clipPath id="s-bodyclip"><rect x="176" y="178" width="208" height="164" rx="36" /></clipPath>
          <filter id="s-b8"><feGaussianBlur stdDeviation="8" /></filter>
          <filter id="s-b3"><feGaussianBlur stdDeviation="3" /></filter>
        </defs>

        {/* ciphertext backdrop */}
        <g mask="url(#s-cmask)" opacity=".5">
          {rows.map((r, i) => (
            <text key={i} x="280" y={40 + i * 17} textAnchor="middle" style={{ fontFamily: 'var(--mono)' }} fontSize="11" letterSpacing="2" fill="#fff" fillOpacity={0.05 + (i % 3) * 0.02}>{r}</text>
          ))}
        </g>

        <ellipse cx="280" cy="356" rx="200" ry="38" fill="url(#s-glow)" />
        <g transform="translate(280 250) scale(1.1) translate(-280 -250)">
          {/* floor reflection */}
          <rect x="176" y="346" width="208" height="56" rx="20" fill="url(#s-refl)" />
          <ellipse cx="290" cy="346" rx="118" ry="8" fill="#000" opacity=".7" filter="url(#s-b3)" />
          {/* shackle */}
          <path d="M218 196 V150 a62 62 0 0 1 124 0 V196" fill="none" stroke="#0E0E10" strokeWidth="30" strokeLinecap="round" transform="translate(5 7)" opacity=".75" />
          <path d="M218 196 V150 a62 62 0 0 1 124 0 V196" fill="none" stroke="url(#s-sh)" strokeWidth="26" strokeLinecap="round" />
          <path d="M212 160 a68 68 0 0 1 58 -70" fill="none" stroke="#fff" strokeOpacity=".55" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M346 120 a62 62 0 0 1 2 40" fill="none" stroke="#fff" strokeOpacity=".25" strokeWidth="2" strokeLinecap="round" />
          {/* body thickness */}
          <rect x="186" y="186" width="208" height="164" rx="36" fill="url(#s-side)" />
          {/* body */}
          <rect x="176" y="178" width="208" height="164" rx="36" fill="url(#s-body)" />
          <g clipPath="url(#s-bodyclip)">
            {Array.from({ length: 40 }, (_, i) => <line key={i} x1="176" x2="384" y1={182 + i * 4} y2={182 + i * 4} stroke="#fff" strokeOpacity={i % 2 ? 0.018 : 0.03} />)}
            <path d="M150 380 L260 160" stroke="#fff" strokeOpacity=".05" strokeWidth="40" />
          </g>
          <rect x="176.5" y="178.5" width="207" height="163" rx="35.5" fill="none" stroke="rgba(255,255,255,.14)" />
          <rect x="184" y="186" width="192" height="148" rx="30" fill="none" stroke="#000" strokeOpacity=".5" />
          <path d="M200 179 H360" stroke="url(#s-edge)" strokeWidth="1.6" />
          {/* keyhole */}
          <circle cx="280" cy="248" r="24" fill="#08C465" opacity=".45" filter="url(#s-b8)" />
          <circle cx="280" cy="244" r="16" fill="#060607" />
          <circle cx="280" cy="244" r="14" fill="url(#s-hole)" />
          <path d="M273 252 L287 252 L291 288 Q291 294 285 294 H275 Q269 294 269 288 Z" fill="url(#s-hole)" />
          <circle cx="276" cy="239" r="3.4" fill="#fff" opacity=".7" />
          <text x="280" y="324" textAnchor="middle" fontWeight="500" fontSize="12" fill="#fff" fillOpacity=".4" letterSpacing=".2">Read only</text>
        </g>
      </svg>
      <Chip x={22} y={52} icon="eye" title="Investor password" sub="View history only" extra={<span className="dot" />} />
      <Chip x={372} y={132} icon="key" title="Encrypted at rest" sub="AES-256-GCM" />
      <Chip x={22} y={318} icon="unlink" symStyle={{ color: '#FF8A82' }} title="Can’t trade or withdraw" sub="By design, not by setting" />
    </>
  );
}
