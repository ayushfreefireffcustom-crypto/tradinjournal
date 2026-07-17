'use client';

// Huge, faded section number sitting behind a header for editorial depth.
// Purely decorative — aria-hidden, non-interactive.

interface Props {
  children: React.ReactNode;
  className?: string;
}

export default function WatermarkNumber({ children, className = '' }: Props) {
  return (
    <span
      aria-hidden
      className={`pointer-events-none select-none absolute font-display font-black leading-none text-white/[0.03] text-[120px] sm:text-[180px] ${className}`}
    >
      {children}
    </span>
  );
}
