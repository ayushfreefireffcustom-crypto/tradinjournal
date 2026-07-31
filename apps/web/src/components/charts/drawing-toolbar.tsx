'use client';

import { TrendUp, Minus, ArrowsOutLineVertical, Path, Trash } from '@phosphor-icons/react';

// klinecharts built-in overlay names.
const TOOLS: { name: string; label: string; icon: typeof TrendUp }[] = [
  { name: 'straightLine', label: 'Trend line', icon: TrendUp },
  { name: 'horizontalStraightLine', label: 'Horizontal line', icon: Minus },
  { name: 'priceLine', label: 'Price line', icon: ArrowsOutLineVertical },
  { name: 'fibonacciLine', label: 'Fibonacci', icon: Path },
];

export default function DrawingToolbar({
  onDraw,
  onClear,
}: {
  onDraw: (name: string) => void;
  onClear: () => void;
}) {
  return (
    <div className="flex items-center gap-1" data-testid="drawing-toolbar">
      {TOOLS.map(t => {
        const I = t.icon;
        return (
          <button
            key={t.name}
            onClick={() => onDraw(t.name)}
            title={t.label}
            className="p-1.5 rounded text-fg-3 border border-transparent hover:text-fg hover:border-border-soft transition-colors"
          >
            <I size={14} weight="bold" />
          </button>
        );
      })}
      <button
        onClick={onClear}
        title="Clear drawings"
        className="p-1.5 rounded text-fg-3 border border-transparent hover:text-loss hover:border-border-soft transition-colors"
      >
        <Trash size={14} weight="bold" />
      </button>
    </div>
  );
}
