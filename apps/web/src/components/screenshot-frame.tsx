'use client';

// Premium product-screenshot frame: a rounded, bordered container with a real
// layered shadow, a 1px inner top highlight, an optional minimal browser chrome
// (three dots — no URL clutter) and a soft green glow behind it.
//
// On desktop it also gets a tasteful cursor-tracking 3D tilt: the frame leans
// toward the pointer and a soft light-glare follows the cursor, so the part of
// the screenshot you hover "pops" toward you. Disabled on touch devices and
// under prefers-reduced-motion.

import Image from 'next/image';
import { motion, useMotionValue, useSpring, useMotionTemplate, useReducedMotion } from 'framer-motion';
import { useRef, useState, useEffect } from 'react';

interface Props {
  src: string;
  alt: string;
  /** intrinsic pixel size of the source (for next/image ratio) */
  width: number;
  height: number;
  /** optional art-directed mobile source (tighter/zoomed crop) shown below sm */
  mobileSrc?: string;
  mobileWidth?: number;
  mobileHeight?: number;
  chrome?: boolean;
  glow?: boolean;
  tilt?: boolean;
  priority?: boolean;
  sizes?: string;
  className?: string;
}

const MAX_TILT = 5; // degrees

export default function ScreenshotFrame({
  src,
  alt,
  width,
  height,
  mobileSrc,
  mobileWidth,
  mobileHeight,
  chrome = true,
  glow = true,
  tilt = true,
  priority = false,
  sizes = '(max-width: 1024px) 100vw, 55vw',
  className = '',
}: Props) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const [enabled, setEnabled] = useState(false);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    setEnabled(
      tilt && !reduce &&
      typeof window !== 'undefined' &&
      window.matchMedia('(hover: hover) and (pointer: fine)').matches,
    );
  }, [tilt, reduce]);

  // Raw pointer-driven values, smoothed with springs so the motion feels fluid.
  const rxRaw = useMotionValue(0);
  const ryRaw = useMotionValue(0);
  const rotateX = useSpring(rxRaw, { stiffness: 150, damping: 17, mass: 0.4 });
  const rotateY = useSpring(ryRaw, { stiffness: 150, damping: 17, mass: 0.4 });
  const gx = useSpring(useMotionValue(50), { stiffness: 200, damping: 26 });
  const gy = useSpring(useMotionValue(50), { stiffness: 200, damping: 26 });
  const glare = useMotionTemplate`radial-gradient(420px circle at ${gx}% ${gy}%, rgba(255,255,255,0.10), transparent 46%)`;

  function onMove(e: React.MouseEvent) {
    if (!enabled || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    ryRaw.set((px - 0.5) * MAX_TILT * 2);
    rxRaw.set((0.5 - py) * MAX_TILT * 2);
    gx.set(px * 100);
    gy.set(py * 100);
  }
  function onLeave() {
    rxRaw.set(0);
    ryRaw.set(0);
    gx.set(50);
    gy.set(50);
    setHovered(false);
  }

  return (
    <div className={`relative ${className}`} style={{ perspective: enabled ? 1200 : undefined }}>
      {glow && <div className="glow-blob -inset-8 sm:-inset-12" aria-hidden />}
      <motion.div
        ref={ref}
        onMouseMove={onMove}
        onMouseEnter={() => enabled && setHovered(true)}
        onMouseLeave={onLeave}
        style={enabled ? { rotateX, rotateY, transformStyle: 'preserve-3d', boxShadow: 'var(--shadow-lg)' } : { boxShadow: 'var(--shadow-lg)' }}
        animate={enabled ? { scale: hovered ? 1.02 : 1 } : undefined}
        transition={{ type: 'spring', stiffness: 200, damping: 20 }}
        className="relative rounded-2xl border border-border overflow-hidden bg-surface"
      >
        {/* inner top highlight */}
        <span
          className="pointer-events-none absolute inset-x-0 top-0 h-px z-10"
          style={{ background: 'rgba(255,255,255,0.06)' }}
          aria-hidden
        />
        {chrome && (
          // Chrome is hidden on mobile so the screenshot itself dominates the
          // small viewport; it returns at sm+ where there's room for it.
          <div className="hidden sm:flex items-center gap-1.5 px-4 py-2.5 border-b border-border-soft bg-app/80">
            <span className="w-2.5 h-2.5 rounded-full bg-loss/70" />
            <span className="w-2.5 h-2.5 rounded-full bg-warning/70" />
            <span className="w-2.5 h-2.5 rounded-full bg-profit/70" />
          </div>
        )}
        {mobileSrc ? (
          <>
            {/* Zoomed mobile crop — reads clearly on small screens */}
            <Image
              src={mobileSrc}
              alt={alt}
              width={mobileWidth ?? width}
              height={mobileHeight ?? height}
              priority={priority}
              sizes="100vw"
              className="w-full h-auto block select-none sm:hidden"
              draggable={false}
            />
            <Image
              src={src}
              alt={alt}
              width={width}
              height={height}
              priority={priority}
              sizes={sizes}
              className="w-full h-auto hidden select-none sm:block"
              draggable={false}
            />
          </>
        ) : (
          <Image
            src={src}
            alt={alt}
            width={width}
            height={height}
            priority={priority}
            sizes={sizes}
            className="w-full h-auto block select-none"
            draggable={false}
          />
        )}
        {/* Cursor-following glare — makes the hovered area feel lifted */}
        {enabled && (
          <motion.span
            className="pointer-events-none absolute inset-0 z-20"
            style={{ background: glare, mixBlendMode: 'overlay' }}
            animate={{ opacity: hovered ? 1 : 0 }}
            transition={{ duration: 0.25 }}
            aria-hidden
          />
        )}
      </motion.div>
    </div>
  );
}
