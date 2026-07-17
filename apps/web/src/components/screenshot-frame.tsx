'use client';

// Premium product-screenshot frame: a rounded, bordered container with a real
// layered shadow, a 1px inner top highlight, an optional minimal browser chrome
// (three dots — no URL clutter) and a soft green glow behind it. Replaces the
// old flat framed <img> treatment used across the landing page.

import Image from 'next/image';

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
  priority?: boolean;
  sizes?: string;
  className?: string;
}

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
  priority = false,
  sizes = '(max-width: 1024px) 100vw, 55vw',
  className = '',
}: Props) {
  return (
    <div className={`relative ${className}`}>
      {glow && <div className="glow-blob -inset-8 sm:-inset-12" aria-hidden />}
      <div
        className="relative rounded-2xl border border-border overflow-hidden bg-surface"
        style={{ boxShadow: 'var(--shadow-lg)' }}
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
      </div>
    </div>
  );
}
