'use client';

// Staggered scroll-reveal container. Children wrapped in <RevealItem> cascade in
// when the group scrolls into view (framer variants + staggerChildren), which is
// cleaner than hand-tuning per-item `delay` props on a grid. Honors
// prefers-reduced-motion (fades only, no movement, no stagger travel).

import { motion, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';

const EASE = [0.22, 1, 0.36, 1] as const;

export function RevealGroup({ className = '', children }: { className?: string; children: ReactNode }) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.15, margin: '0px 0px -8% 0px' }}
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.08 } } }}
    >
      {children}
    </motion.div>
  );
}

export function RevealItem({ className = '', children }: { className?: string; children: ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      variants={{
        hidden: reduce ? { opacity: 0 } : { opacity: 0, y: 22 },
        show: { opacity: 1, y: 0, transition: { duration: reduce ? 0.001 : 0.6, ease: EASE } },
      }}
    >
      {children}
    </motion.div>
  );
}
