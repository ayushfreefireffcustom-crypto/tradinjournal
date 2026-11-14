'use client';

// Drawing rail (E): klinecharts' own drawing tools, plus magnet, lock, hide and
// clear for your drawings. A column beside the chart on desktop, a scrolling
// row under the toolbar on phones.
import { useState } from 'react';
import { useScrollFade } from './use-scroll-fade';
import { Crosshair, Eye, EyeSlash, LineSegment, LockSimple, LockSimpleOpen, MagnetStraight, Minus, Spiral, Tag, TextT, Trash, Ruler } from '@phosphor-icons/react';

const TOOLS = [
  { name: 'segment', label: 'Trend line', Icon: LineSegment },
  { name: 'horizontalStraightLine', label: 'Horizontal line', Icon: Minus },
  { name: 'priceLine', label: 'Price line', Icon: Tag },
  { name: 'fibonacciLine', label: 'Fibonacci retracement', Icon: Spiral },
  { name: 'simpleAnnotation', label: 'Text note', Icon: TextT },
] as const;

export interface RailHandlers {
  onDraw: (name: string) => void;
  onClear: () => void;
  onMagnet: (on: boolean) => void;
  onLock: (on: boolean) => void;
  onHide: (hidden: boolean) => void;
  ruler: boolean;
  onRuler: () => void;
}

export default function DrawingRail(p: RailHandlers & { className?: string }) {
  const [tool, setTool] = useState<string | null>(null);
  const [magnet, setMagnet] = useState(false);
  const [locked, setLocked] = useState(false);
  const [hidden, setHidden] = useState(false);
  const pick = (name: string) => { setTool(name); p.onDraw(name); };
  const ref = useScrollFade<HTMLDivElement>();
  return (
    <div ref={ref} className={`tl-rail ${p.className ?? ''}`} role="toolbar" aria-label="Drawing tools" data-testid="drawing-rail">
      <button type="button" className={tool == null ? 'on' : ''} onClick={() => setTool(null)} title="Crosshair" aria-label="Crosshair" aria-pressed={tool == null}><Crosshair size={18} /></button>
      {TOOLS.map(({ name, label, Icon }) => (
        <button key={name} type="button" className={tool === name ? 'on' : ''} onClick={() => pick(name)} title={label} aria-label={label} data-testid={`draw-${name}`}><Icon size={18} /></button>
      ))}
      <button type="button" className={p.ruler ? 'on' : ''} onClick={p.onRuler} title="Risk ruler" aria-label="Risk ruler" aria-pressed={p.ruler}><Ruler size={18} /></button>
      <i aria-hidden />
      <button type="button" className={magnet ? 'on' : ''} aria-pressed={magnet} onClick={() => { setMagnet(!magnet); p.onMagnet(!magnet); }} title="Magnet: snap new drawings to prices" aria-label="Magnet"><MagnetStraight size={18} /></button>
      <button type="button" className={locked ? 'on' : ''} aria-pressed={locked} onClick={() => { setLocked(!locked); p.onLock(!locked); }} title={locked ? 'Unlock drawings' : 'Lock drawings'} aria-label={locked ? 'Unlock drawings' : 'Lock drawings'}>{locked ? <LockSimple size={18} /> : <LockSimpleOpen size={18} />}</button>
      <button type="button" className={hidden ? 'on' : ''} aria-pressed={hidden} onClick={() => { setHidden(!hidden); p.onHide(!hidden); }} title={hidden ? 'Show drawings' : 'Hide drawings'} aria-label={hidden ? 'Show drawings' : 'Hide drawings'}>{hidden ? <EyeSlash size={18} /> : <Eye size={18} />}</button>
      <button type="button" onClick={() => { setTool(null); p.onClear(); }} title="Clear drawings" aria-label="Clear drawings" data-testid="draw-clear"><Trash size={18} /></button>
    </div>
  );
}
