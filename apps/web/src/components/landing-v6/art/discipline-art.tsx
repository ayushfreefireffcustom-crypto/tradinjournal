import { Sample } from '../ui';
import { Ic, type IconName } from '../icons';

// Discipline (the only red scene): an extruded glass shield with a bevelled rim,
// floating red tokens, stacked alerts and a behaviour-score gauge. Canvas 560×400.

const SHIELD = 'M280 104 L388 142 V232 C388 296 340 336 280 360 C220 336 172 296 172 232 V142 Z';
const FACE = 'M280 120 L372 152 V231 C372 287 330 322 280 343 C230 322 188 287 188 231 V152 Z';

/** Red glass token: an extruded disc with an icon. */
function Token({ x, y, r, o, icon, blur }: { x: number; y: number; r: number; o: number; icon: IconName; blur?: boolean }) {
  return (
    <g opacity={o} filter={blur ? 'url(#d-soft)' : undefined}>
      <ellipse cx={x + 6} cy={y + r + 14} rx={r * 0.9} ry={r * 0.22} fill="#000" opacity=".45" filter="url(#d-b6)" />
      <ellipse cx={x} cy={y + 7} rx={r} ry={r * 0.92} fill="#5A0E0A" />
      <ellipse cx={x} cy={y} rx={r} ry={r * 0.92} fill="url(#d-tok)" />
      <ellipse cx={x} cy={y} rx={r - 5} ry={(r - 5) * 0.92} fill="none" stroke="#fff" strokeOpacity=".22" />
      <path d={`M${x - r * 0.7} ${y - r * 0.45} Q${x} ${y - r * 1.05} ${x + r * 0.7} ${y - r * 0.45}`} fill="none" stroke="#fff" strokeOpacity=".55" strokeWidth="1.4" strokeLinecap="round" />
      <g transform={`translate(${x - r * 0.42} ${y - r * 0.42}) scale(${(r * 0.84) / 24})`} color="#fff" stroke="#fff" fill="none" strokeWidth={2.2}>
        <use href={`#lp6-${icon}`} width="24" height="24" />
      </g>
    </g>
  );
}

export default function DisciplineArt() {
  return (
    <>
      <div className="art-dots" />
      <Sample style={{ left: 16, top: 16 }} />
      <svg width="560" height="400" viewBox="0 0 560 400" style={{ position: 'absolute', inset: 0 }} aria-hidden>
        <defs>
          <linearGradient id="d-side" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#6A1A15" /><stop offset="1" stopColor="#1A0606" /></linearGradient>
          <linearGradient id="d-body" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#5A1A15" /><stop offset=".5" stopColor="#270B09" /><stop offset="1" stopColor="#140707" /></linearGradient>
          <linearGradient id="d-face" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FFFFFF" /><stop offset=".55" stopColor="#ECECF0" /><stop offset="1" stopColor="#B5B5BE" /></linearGradient>
          <linearGradient id="d-rim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FFB3AD" /><stop offset=".5" stopColor="#FE3A31" stopOpacity=".7" /><stop offset="1" stopColor="#FE3A31" stopOpacity=".15" /></linearGradient>
          <radialGradient id="d-glow" cx="50%" cy="50%" r="50%"><stop offset="0" stopColor="#FE3A31" stopOpacity=".6" /><stop offset="1" stopColor="#FE3A31" stopOpacity="0" /></radialGradient>
          <linearGradient id="d-shine" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#fff" stopOpacity="0" /><stop offset=".5" stopColor="#fff" stopOpacity=".9" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></linearGradient>
          <radialGradient id="d-tok" cx="40%" cy="30%" r="80%"><stop offset="0" stopColor="#FF8A80" /><stop offset=".45" stopColor="#E0281F" /><stop offset="1" stopColor="#7A0F0A" /></radialGradient>
          <radialGradient id="d-inner" cx="50%" cy="35%" r="70%"><stop offset=".6" stopColor="#000" stopOpacity="0" /><stop offset="1" stopColor="#000" stopOpacity=".22" /></radialGradient>
          <clipPath id="d-faceclip"><path d={FACE} /></clipPath>
          <filter id="d-b6" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6" /></filter>
          <filter id="d-b16" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="16" /></filter>
          <filter id="d-soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="1.4" /></filter>
        </defs>

        <ellipse cx="280" cy="366" rx="210" ry="40" fill="url(#d-glow)" />
        <ellipse cx="292" cy="370" rx="120" ry="12" fill="#000" opacity=".6" filter="url(#d-b6)" />

        <Token x={108} y={170} r={26} o={0.95} icon="flame" />
        <Token x={452} y={150} r={20} o={0.8} icon="pause" blur />
        <Token x={86} y={296} r={16} o={0.5} icon="gauge" blur />
        <Token x={474} y={282} r={22} o={0.9} icon="list" />

        {/* extrusion: the shield's thickness */}
        <path d={SHIELD} transform="translate(10 12)" fill="url(#d-side)" />
        <path d={SHIELD} fill="#FE3A31" opacity=".35" filter="url(#d-b16)" />
        {/* body + bevelled rim */}
        <path d={SHIELD} fill="url(#d-body)" stroke="url(#d-rim)" strokeWidth="2.2" />
        <path d="M280 110 L382 146" stroke="#FFD5D1" strokeOpacity=".8" strokeWidth="1.2" />
        {/* glossy face */}
        <path d={FACE} fill="url(#d-face)" />
        <path d={FACE} fill="url(#d-inner)" />
        <g clipPath="url(#d-faceclip)">
          <path d="M280 120 L372 152 V178 C334 160 304 155 280 155 C256 155 226 160 188 178 V152 Z" fill="#fff" opacity=".7" />
          <path d="M196 340 L320 110" stroke="#fff" strokeOpacity=".35" strokeWidth="18" />
        </g>
        <path d={FACE} fill="none" stroke="#000" strokeOpacity=".18" />
        {/* emblem: a streak interrupted — engraved groove + crisp stroke */}
        <g transform="translate(280 240)" strokeLinecap="round" strokeLinejoin="round" fill="none">
          <path d="M-56 24 L-30 -6 L-11 11 L8 -15" stroke="#fff" strokeWidth="9" transform="translate(0 1.5)" />
          <path d="M-56 24 L-30 -6 L-11 11 L8 -15" stroke="#2A2A30" strokeWidth="7" />
          <g stroke="#FE3A31" strokeWidth="7"><path d="M22 -28 L52 2" /><path d="M52 -28 L22 2" /></g>
        </g>
        <path d="M206 160 Q280 132 354 160" fill="none" stroke="url(#d-shine)" strokeWidth="2.6" />
      </svg>

      {/* stacked alerts */}
      <div className="chip red-t dim" style={{ left: 154, top: 16, opacity: 0.3 }}><span className="sym" style={{ background: 'rgba(254,58,49,.2)', color: '#FF8A82' }}><Ic name="flame" size={14} /></span>Revenge sequence detected</div>
      <div className="chip red-t" style={{ left: 120, top: 56 }}>
        <span className="sym" style={{ background: 'rgba(254,58,49,.22)', color: '#FF8A82' }}><Ic name="flame" size={15} /></span>
        <div>Revenge sequence<small style={{ color: '#E8A7A2' }}>4 trades in 11 min after a loss</small></div>
        <span className="dot r" />
      </div>
      {/* behaviour score gauge */}
      <div className="chip" style={{ left: 330, top: 258 }}>
        <svg width="34" height="34" viewBox="0 0 34 34" aria-hidden>
          <circle cx="17" cy="17" r="13" fill="none" stroke="#fff" strokeOpacity=".1" strokeWidth="4" />
          <circle cx="17" cy="17" r="13" fill="none" stroke="#FE3A31" strokeWidth="4" strokeLinecap="round" strokeDasharray={`${0.62 * 81.7} 81.7`} transform="rotate(-90 17 17)" />
        </svg>
        <div>Behaviour score <span className="num">62</span><small><span className="num">2</span> of <span className="num">3</span> rules kept this week</small></div>
      </div>
    </>
  );
}
