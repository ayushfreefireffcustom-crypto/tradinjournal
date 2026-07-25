'use client';

// Resilient news image: renders nothing when there's no src or the image fails
// to load (cross-domain feed images can 404 / hotlink-block), so cards never show
// a broken-image box. Plain <img> avoids next/image per-domain config.
import { useState } from 'react';

export default function NewsThumb({ src, className }: { src: string | null; className: string }) {
  const [ok, setOk] = useState(true);
  if (!src || !ok) return null;
  return <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setOk(false)} className={className} />;
}
