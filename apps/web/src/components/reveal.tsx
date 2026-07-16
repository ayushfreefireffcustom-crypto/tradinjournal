'use client';

// Scroll-reveal wrapper. Renders hidden (via the `.reveal` class) and adds
// `.reveal-visible` the first time it scrolls into view, so sections animate in
// as the user reaches them rather than all at once on load. Reuses the existing
// `useInView` IntersectionObserver hook; under prefers-reduced-motion the CSS
// forces the final state instantly. Pass `delay` (ms) for a staggered cascade.

import type { CSSProperties, ElementType, ReactNode } from 'react';
import { useInView } from '@/hooks/use-in-view';

interface RevealProps {
  as?: ElementType;
  delay?: number;
  className?: string;
  children?: ReactNode;
  [key: string]: unknown;
}

export default function Reveal({ as, delay = 0, className = '', children, ...rest }: RevealProps) {
  const Tag = (as ?? 'div') as ElementType;
  const [ref, inView] = useInView<HTMLElement>();
  const style = delay ? ({ '--reveal-delay': `${delay}ms` } as CSSProperties) : undefined;

  return (
    <Tag
      ref={ref}
      className={`reveal ${inView ? 'reveal-visible' : ''} ${className}`.trim()}
      style={style}
      {...rest}
    >
      {children}
    </Tag>
  );
}
