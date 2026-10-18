'use client';

// klinecharts built-in overlay names.
const TOOLS: { name: string; label: string; icon: React.ReactNode }[] = [
  { name: 'straightLine', label: 'Trend line', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M5 19L19 5" /></svg> },
  { name: 'horizontalStraightLine', label: 'Horizontal line', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><path d="M4 12h16" /></svg> },
  { name: 'priceLine', label: 'Price line', icon: <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeDasharray="2 3"><path d="M4 12h16" /></svg> },
  { name: 'fibonacciLine', label: 'Fibonacci retracement', icon: <span className="ch-fib">Fib</span> },
];

export default function DrawingToolbar({ onDraw, onClear }: { onDraw: (name: string) => void; onClear: () => void }) {
  return (
    <div className="ch-draw" role="group" aria-label="Drawing tools" data-testid="drawing-toolbar">
      {TOOLS.map(t => <button key={t.name} onClick={() => onDraw(t.name)} title={t.label} aria-label={t.label}>{t.icon}</button>)}
      <button onClick={onClear} title="Clear drawings" aria-label="Clear drawings" className="clr">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13" /></svg>
      </button>
    </div>
  );
}
