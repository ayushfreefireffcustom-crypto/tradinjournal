'use client';

// Small glassy stat / annotation card meant to overlap a screenshot corner.
// The caller positions it absolutely and passes a `parallax` range so each card
// drifts at a slightly different speed on scroll — that speed difference is what
// reads as real depth. Static under reduced-motion. Hidden on small screens by
// the caller (they'd overflow), so this stays purely presentational.

import { motion, useScroll, useTransform, useReducedMotion } from 'framer-motion';
import { useRef, type ReactNode } from 'react';

interface Props {
  /** vertical parallax travel in px, e.g. [-24, 24]; larger = closer/faster */
  parallax?: [number, number];
  className?: string;
  children: ReactNode;
}

export default function FloatingCard({ parallax = [-18, 18], className = '', children }: Props) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 1], parallax);
  return (
    <motion.div
      ref={ref}
      style={{ ...(reduce ? {} : { y }), boxShadow: 'var(--shadow-md)' }}
      className={`rounded-xl border border-border bg-[#0E0E0E]/90 backdrop-blur-md px-3.5 py-3 ${className}`}
    >
      {children}
    </motion.div>
  );
}
