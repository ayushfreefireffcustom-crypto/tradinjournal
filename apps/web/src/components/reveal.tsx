'use client';

// Scroll-reveal wrapper, powered by framer-motion. Elements "materialize from
// nothing": they start transparent, lower, slightly shrunk and blurred, then
// ease into place with a premium cubic easing and optional per-item delay for
// staggered cascades.
//
// Re-triggers EVERY time an element enters the viewport (once:false), so
// scrolling back up and down replays the motion — the page always feels alive,
// never a one-shot that dies after the first pass. Honors
// prefers-reduced-motion (instant fade, no travel/blur).
//
// Keeping the same `<Reveal as delay className>` API means every section on the
// landing page gets the upgraded motion without touching call sites.

import { motion, useReducedMotion } from 'framer-motion';
import type { ElementType, ReactNode } from 'react';

const EASE = [0.22, 1, 0.36, 1] as const; // matches --ease-premium

interface RevealProps {
  as?: ElementType;
  delay?: number;
  className?: string;
  children?: ReactNode;
  [key: string]: unknown;
}

export default function Reveal({ as, delay = 0, className = '', children, ...rest }: RevealProps) {
  const reduce = useReducedMotion();
  const tag = (as ?? 'div') as keyof typeof motion;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const MotionTag = ((motion as any)[tag] ?? motion.div) as any;

  const hidden = reduce
    ? { opacity: 0 }
    : { opacity: 0, y: 34, scale: 0.965, filter: 'blur(7px)' };
  const shown = reduce
    ? { opacity: 1 }
    : { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' };

  return (
    <MotionTag
      className={className}
      initial={hidden}
      whileInView={shown}
      viewport={{ once: false, amount: 0.2, margin: '0px 0px -12% 0px' }}
      transition={{ duration: reduce ? 0.001 : 0.85, ease: EASE, delay: delay / 1000 }}
      {...rest}
    >
      {children}
    </MotionTag>
  );
}
