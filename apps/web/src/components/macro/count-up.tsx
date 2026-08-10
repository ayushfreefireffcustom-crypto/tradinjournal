'use client';

import { useCountUp } from '@/hooks/use-count-up';

interface Props {
  value: number | null | undefined;
  /** Appended after the number, e.g. "%" */
  suffix?: string;
  decimals?: number;
  duration?: number;
  className?: string;
  /** Fallback when value is null */
  fallback?: string;
  'data-testid'?: string;
}

/** Renders a number that counts up from 0 on mount / when value changes. */
export default function CountUp({
  value,
  suffix = '',
  decimals = 0,
  duration = 900,
  className = '',
  fallback = '—',
  'data-testid': testId,
}: Props) {
  const n = useCountUp(value, { decimals, duration, enabled: value != null, fromZero: true });
  if (n == null || !Number.isFinite(n)) {
    return <span className={className} data-testid={testId}>{fallback}</span>;
  }
  const text = decimals > 0 ? n.toFixed(decimals) : String(Math.round(n));
  return (
    <span className={className} data-testid={testId}>
      {text}{suffix}
    </span>
  );
}
