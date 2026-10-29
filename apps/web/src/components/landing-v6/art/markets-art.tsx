import { Chip, Sample } from '../ui';

// Markets & macro: a dotted globe with an atmosphere rim, night-side shading,
// session pins joined by glowing arcs, and a session timeline. Canvas 560×400.

const CX = 280, CY = 338, RAD = 214, TILT = -0.35;

function project(lat: number, lon: number) {
  const la = (lat * Math.PI) / 180, lo = ((lon + 20) * Math.PI) / 180;
  const x = Math.cos(la) * Math.sin(lo), y = Math.sin(la), z = Math.cos(la) * Math.cos(lo);
  const y2 = y * Math.cos(TILT) - z * Math.sin(TILT), z2 = y * Math.sin(TILT) + z * Math.cos(TILT);
  return { px: CX + x * RAD, py: CY - y2 * RAD, z: z2 };
}

const isLand = (lat: number, lon: number) =>
  (lat > 10 && lat < 70 && lon > -130 && lon < -60) || (lat > -55 && lat < 12 && lon > -80 && lon < -35) ||
  (lat > 35 && lat < 70 && lon > -10 && lon < 40) || (lat > -35 && lat < 35 && lon > -18 && lon < 50) ||
  (lat > 5 && lat < 70 && lon > 40 && lon < 140) || (lat > -40 && lat < -12 && lon > 113 && lon < 153);

function dots() {
  const out: { x: number; y: number; r: number; o: number }[] = [];
  for (let lat = -80; lat <= 80; lat += 7) for (let lon = -180; lon < 180; lon += 5.5) {
    const p = project(lat, lon);
    if (p.z <= 0.05) continue;
    const land = isLand(lat, lon);
    out.push({ x: p.px, y: p.py, r: land ? 1.9 : 1.05, o: (land ? 0.6 : 0.13) * p.z });
  }
  return out;
}

const PINS = [
  { lat: 51.5, lon: -0.1, name: 'London', on: true },
  { lat: 40.7, lon: -74, name: 'New York', on: false },
  { lat: 35.7, lon: 139.7, name: 'Tokyo', on: false },
].map(p => ({ ...p, ...project(p.lat, p.lon) })).filter(p => p.z > 0);

export default function MarketsArt() {
  const d = dots();
  const [lon, ny] = [PINS.find(p => p.name === 'London'), PINS.find(p => p.name === 'New York')];
  return (
    <>
      <Sample style={{ right: 16, top: 16 }} />
      <svg width="560" height="400" viewBox="0 0 560 400" style={{ position: 'absolute', inset: 0 }} aria-hidden>
        <defs>
          <radialGradient id="m-gb" cx="42%" cy="32%" r="72%"><stop offset="0" stopColor="#2E2E35" /><stop offset=".6" stopColor="#151518" /><stop offset="1" stopColor="#0B0B0D" /></radialGradient>
          <radialGradient id="m-atmo" cx="50%" cy="50%" r="50%"><stop offset=".86" stopColor="#fff" stopOpacity="0" /><stop offset=".93" stopColor="#fff" stopOpacity=".12" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></radialGradient>
          <linearGradient id="m-night" x1="0" y1="0" x2="1" y2="0"><stop offset=".45" stopColor="#000" stopOpacity="0" /><stop offset="1" stopColor="#000" stopOpacity=".55" /></linearGradient>
          <linearGradient id="m-arc" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#fff" stopOpacity=".6" /><stop offset="1" stopColor="#3DE296" /></linearGradient>
          <clipPath id="m-clip"><circle cx={CX} cy={CY} r={RAD} /></clipPath>
          <filter id="m-glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="3.5" /></filter>
        </defs>
        <circle cx={CX} cy={CY} r={RAD + 26} fill="url(#m-atmo)" />
        <circle cx={CX} cy={CY} r={RAD} fill="url(#m-gb)" />
        <g clipPath="url(#m-clip)">
          {/* meridians + parallels */}
          {[-60, -30, 0, 30, 60].map(l => <ellipse key={l} cx={CX + Math.sin((l * Math.PI) / 180) * RAD * 0.02} cy={CY} rx={Math.abs(Math.sin(((l + 20) * Math.PI) / 180)) * RAD} ry={RAD} fill="none" stroke="#fff" strokeOpacity=".04" />)}
          {[-40, -10, 20, 50].map(l => { const p = project(l, -20); return <ellipse key={l} cx={CX} cy={p.py} rx={Math.cos((l * Math.PI) / 180) * RAD} ry={Math.cos((l * Math.PI) / 180) * RAD * 0.34} fill="none" stroke="#fff" strokeOpacity=".04" />; })}
          {d.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={p.r} fill="#fff" fillOpacity={p.o} />)}
          <rect x={CX - RAD} y={CY - RAD} width={RAD * 2} height={RAD * 2} fill="url(#m-night)" />
        </g>
        <circle cx={CX} cy={CY} r={RAD} fill="none" stroke="#fff" strokeOpacity=".16" />
        <path d={`M${CX - RAD * 0.86} ${CY - RAD * 0.5} A${RAD} ${RAD} 0 0 1 ${CX + RAD * 0.1} ${CY - RAD * 0.995}`} fill="none" stroke="#fff" strokeOpacity=".35" strokeWidth="1.4" />

        {/* session arc London → New York */}
        {lon && ny && (
          <>
            <path d={`M${ny.px} ${ny.py} Q${(ny.px + lon.px) / 2} ${Math.min(ny.py, lon.py) - 70} ${lon.px} ${lon.py}`} fill="none" stroke="#08C465" strokeOpacity=".55" strokeWidth="5" filter="url(#m-glow)" />
            <path d={`M${ny.px} ${ny.py} Q${(ny.px + lon.px) / 2} ${Math.min(ny.py, lon.py) - 70} ${lon.px} ${lon.py}`} fill="none" stroke="url(#m-arc)" strokeWidth="1.6" strokeDasharray="3 4" />
          </>
        )}
        {PINS.map(p => (
          <g key={p.name}>
            <circle className="pulse" cx={p.px} cy={p.py} r={14} fill={p.on ? '#08C465' : '#fff'} opacity=".25" />
            <circle cx={p.px} cy={p.py} r={10} fill={p.on ? '#08C465' : '#fff'} fillOpacity=".16" />
            <circle cx={p.px} cy={p.py} r={4.5} fill={p.on ? '#08C465' : '#fff'} />
            <text x={p.px + 16} y={p.py - 10} fontSize="10.5" fill={p.on ? '#8FD9B4' : '#8A8A90'}>{p.name}</text>
          </g>
        ))}
      </svg>

      {/* session timeline */}
      <div className="track">
        <div className="rail">
          <div className="fill" />
          <span className="k on" style={{ left: 0 }} /><span className="nm" style={{ left: -4 }}>Tokyo</span>
          <span className="k on" style={{ left: '29%' }} /><span className="nm" style={{ left: 'calc(29% - 6px)' }}>London</span>
          <span className="k now" style={{ left: '58%' }} /><span className="nm" style={{ left: 'calc(58% - 10px)', color: '#8FD9B4' }}>New York</span>
          <span className="k" style={{ left: '84%' }} />
          <span className="k" style={{ right: 0 }} />
          <span className="num tm" style={{ left: -2 }}>00:00</span>
          <span className="num tm" style={{ left: '27%' }}>07:00</span>
          <span className="num tm" style={{ left: '56%', color: '#8FD9B4' }}>13:30</span>
          <span className="num tm" style={{ left: '82%' }}>19:00</span>
        </div>
      </div>
      <Chip x={300} y={196} sym="US" title="CPI release · 13:30" sub="High impact · watching XAUUSD" extra={<span className="dot r" />} />
      <Chip x={30} y={300} sym="XAU" title="Macro bias · gold" sub="Bullish · rates easing" />
      <Chip x={330} y={318} icon="bell" title="Alert hit" sub={<>EURUSD crossed <span className="num">1.0900</span></>} />
    </>
  );
}
