'use client';

import { useCountUp } from '@/hooks/use-count-up';

interface Props {
  value: number;
  // Format the tweened number into the final display string (e.g. add $, %, sign).
  format: (n: number) => string;
  className?: string;
  durationMs?: number;
  'data-testid'?: string;
}

// Renders a number that counts up/down to `value`. Formatting is caller-supplied
// so the same component drives currency, percentages, counts, etc. The final
// (settled) value always formats from the exact target to avoid rounding drift.
export default function AnimatedNumber({ value, format, className, durationMs, ...rest }: Props) {
  const display = useCountUp(value, durationMs);
  const shown = Math.abs(display - value) < 1e-6 ? value : display;
  return (
    <span className={className} data-testid={rest['data-testid']}>
      {format(shown)}
    </span>
  );
}
