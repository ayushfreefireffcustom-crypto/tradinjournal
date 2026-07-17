'use client';

// Scroll-reveal wrapper, powered by framer-motion. Elements start slightly
// lower + transparent and ease into place the first time they enter the
// viewport, with a premium cubic easing and optional per-item delay for
// staggered cascades. Honors prefers-reduced-motion (fades only, no movement).
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

  return (
    <MotionTag
      className={className}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 26 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.18, margin: '0px 0px -8% 0px' }}
      transition={{ duration: reduce ? 0.001 : 0.7, ease: EASE, delay: delay / 1000 }}
      {...rest}
    >
      {children}
    </MotionTag>
  );
}
