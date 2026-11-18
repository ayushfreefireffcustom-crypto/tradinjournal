'use client';

// Generative backgrounds for the landing page. All three share the same rules:
// draw only while on screen, draw one still frame under reduced motion, cap the
// device-pixel ratio, and fail silently (a plain dark background is the fallback).
import { useEffect, useRef } from 'react';

function useVisible(el: React.RefObject<Element | null>, cb: (v: boolean) => void) {
  const cbRef = useRef(cb);
  cbRef.current = cb;
  useEffect(() => {
    const node = el.current;
    if (!node) return;
    if (typeof IntersectionObserver === 'undefined') { cbRef.current(true); return; }
    const io = new IntersectionObserver(([e]) => cbRef.current(!!e?.isIntersecting), { rootMargin: '120px' });
    io.observe(node);
    return () => io.disconnect();
  }, [el]);
}

const reduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ── Hero: domain-warped "silk" in signal green (WebGL fragment shader) ─────
const FS = `precision mediump float;uniform vec2 r;uniform float t;
float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*n(p);p=p*2.03+vec2(1.7,9.2);a*=.5;}return v;}
void main(){vec2 uv=gl_FragCoord.xy/r;vec2 p=(gl_FragCoord.xy-.5*r)/r.y;float tt=t*.06;
vec2 q=vec2(fbm(p*1.4+tt),fbm(p*1.4-tt+3.1));
vec2 w=vec2(fbm(p*1.1+2.2*q+vec2(1.7,9.2)+tt*.7),fbm(p*1.1+2.2*q+vec2(8.3,2.8)-tt*.5));
float f=fbm(p*1.2+2.6*w);float ridge=pow(1.-abs(sin(f*9.+w.x*4.)),6.);
vec3 deep=vec3(.012);vec3 col=deep;col=mix(col,vec3(.01,.09,.05),smoothstep(.25,.85,f));
col+=vec3(.03,.77,.40)*ridge*.2*smoothstep(.2,.9,w.y);col+=vec3(.6,1.,.78)*pow(ridge,3.)*.14*smoothstep(.5,1.,f);
float m=smoothstep(1.15,0.,length((uv-vec2(.5,.98))*vec2(1.25,1.7)));col=mix(deep,col,m);col+=vec3(.05,.5,.25)*pow(m,4.)*.18;
gl_FragColor=vec4(col,1.);}`;

export function SilkCanvas({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const on = useRef(false);
  const kick = useRef<() => void>(() => {});
  useVisible(ref, v => { on.current = v; if (v) kick.current(); });

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const gl = c.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power' });
    if (!gl) return;
    const mk = (type: number, src: string) => { const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const pr = gl.createProgram()!;
    gl.attachShader(pr, mk(gl.VERTEX_SHADER, 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}'));
    gl.attachShader(pr, mk(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return;
    gl.useProgram(pr);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(pr, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const ur = gl.getUniformLocation(pr, 'r'), ut = gl.getUniformLocation(pr, 't');
    const still = reduced();
    const t0 = performance.now() - 14000;
    let raf = 0;
    const draw = () => {
      raf = 0;
      // The shader is soft-focus by design: render at most ~1 MP and let CSS scale it.
      const cw = c.clientWidth, ch = c.clientHeight;
      const d = Math.min(1, Math.sqrt(1_000_000 / Math.max(1, cw * ch)));
      const w = Math.max(1, Math.round(cw * d)), h = Math.max(1, Math.round(ch * d));
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; gl.viewport(0, 0, w, h); }
      gl.uniform2f(ur, w, h);
      gl.uniform1f(ut, still ? 14 : (performance.now() - t0) / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (!still && on.current && !document.hidden) raf = requestAnimationFrame(draw);
    };
    kick.current = () => { if (!raf) raf = requestAnimationFrame(draw); };
    const onVis = () => { if (!document.hidden) kick.current(); };
    const onResize = () => kick.current();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('resize', onResize);
    kick.current();
    return () => {
      if (raf) cancelAnimationFrame(raf);
      kick.current = () => {};
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('resize', onResize);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    };
  }, []);
  return <canvas ref={ref} className={className} aria-hidden />;
}

// ── AI section: a slowly turning globe of points ───────────────────────────
export function OrbCanvas({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const on = useRef(false);
  const kick = useRef<() => void>(() => {});
  useVisible(ref, v => { on.current = v; if (v) kick.current(); });

  useEffect(() => {
    const c = ref.current;
    const x = c?.getContext('2d');
    if (!c || !x) return;
    const S = 900, R = 300, cx = 450, cy = 450, N = 1500;
    const d = Math.min(window.devicePixelRatio || 1, 2);
    c.width = S * d; c.height = S * d;
    x.scale(d, d);
    const still = reduced();
    let raf = 0;
    const draw = (now: number) => {
      raf = 0;
      const t = still ? 0 : now / 1000;
      x.clearRect(0, 0, S, S);
      const g = x.createRadialGradient(cx, cy, 0, cx, cy, R * 1.4);
      g.addColorStop(0, 'rgba(8,196,101,.26)'); g.addColorStop(.45, 'rgba(6,150,80,.1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g; x.fillRect(0, 0, S, S);
      for (let k = 0; k < N; k++) {
        const a = k * 2.39996 + t * 0.05, z = 1 - 2 * ((k + 0.5) / N), r = Math.sqrt(1 - z * z);
        const px = Math.cos(a) * r, pz = Math.sin(a) * r, tilt = 0.35;
        const py = z * Math.cos(tilt) - pz * Math.sin(tilt), dep = z * Math.sin(tilt) + pz * Math.cos(tilt);
        const al = 0.08 + 0.6 * ((dep + 1) / 2) ** 2, s = 0.6 + 1.4 * ((dep + 1) / 2);
        x.fillStyle = `rgba(${(120 + 60 * dep) | 0},255,${(170 + 40 * dep) | 0},${al.toFixed(3)})`;
        x.fillRect(cx + px * R, cy + py * R, s, s);
      }
      x.strokeStyle = 'rgba(125,242,182,.22)'; x.lineWidth = 1;
      for (let i = 0; i < 3; i++) { x.beginPath(); x.ellipse(cx, cy, R * (1.12 + i * 0.14), R * (0.28 + i * 0.05), -0.35 + i * 0.12, 0, Math.PI * 2); x.stroke(); }
      if (!still && on.current && !document.hidden) raf = requestAnimationFrame(draw);
    };
    kick.current = () => { if (!raf) raf = requestAnimationFrame(draw); };
    kick.current();
    return () => { if (raf) cancelAnimationFrame(raf); kick.current = () => {}; };
  }, []);
  return <canvas ref={ref} className={className} aria-hidden />;
}

// ── CTA: a perspective field of candles running to the horizon (static) ────
export function CandleField({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    const x = c?.getContext('2d');
    if (!c || !x) return;
    const draw = () => {
      const d = Math.min(window.devicePixelRatio || 1, 2), W = c.clientWidth, H = c.clientHeight;
      if (!W || !H) return;
      c.width = W * d; c.height = H * d;
      x.setTransform(d, 0, 0, d, 0, 0);
      x.fillStyle = '#030303'; x.fillRect(0, 0, W, H);
      const hz = H * 0.58, cols = W < 700 ? 40 : 70, rows = 26;
      let r = 7; const rr = () => (r = (r * 16807) % 2147483647) / 2147483647;
      for (let j = rows; j >= 1; j--) {
        const z = j / rows, sc = 1 / (z * 3 + 0.25), yy = hz + (H - hz) * (1 - z) * 0.95 + 10;
        for (let i = 0; i < cols; i++) {
          const u = (i / (cols - 1) - 0.5) * 2, xx = W / 2 + u * W * sc * 0.55;
          const up = rr() > 0.42, hgt = (10 + rr() * 42 + Math.sin(i * 0.6 + j * 0.8) * 8) * sc;
          if (xx < -20 || xx > W + 20) continue;
          const bw = Math.max(1, 3.2 * sc), fade = Math.pow(1 - z, 1.6) * (1 - Math.abs(u) * 0.55);
          x.fillStyle = up ? `rgba(46,229,138,${(fade * 0.85).toFixed(3)})` : `rgba(5,110,60,${(fade * 0.6).toFixed(3)})`;
          x.fillRect(xx - bw / 2, yy - hgt, bw, hgt);
          x.fillRect(xx - 0.5, yy - hgt - 6 * sc, 1, hgt + 12 * sc);
        }
      }
      const g = x.createRadialGradient(W / 2, hz, 0, W / 2, hz, W * 0.5);
      g.addColorStop(0, 'rgba(8,196,101,.28)'); g.addColorStop(1, 'rgba(8,196,101,0)');
      x.fillStyle = g; x.fillRect(0, 0, W, H);
      const v = x.createLinearGradient(0, 0, 0, H);
      v.addColorStop(0, '#030303'); v.addColorStop(0.42, 'rgba(3,3,3,.55)'); v.addColorStop(0.75, 'rgba(3,3,3,0)'); v.addColorStop(1, 'rgba(3,3,3,.8)');
      x.fillStyle = v; x.fillRect(0, 0, W, H);
    };
    draw();
    let tm = 0;
    const onResize = () => { clearTimeout(tm); tm = window.setTimeout(draw, 150); };
    window.addEventListener('resize', onResize);
    return () => { clearTimeout(tm); window.removeEventListener('resize', onResize); };
  }, []);
  return <canvas ref={ref} className={className} aria-hidden />;
}
