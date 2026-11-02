'use client';

// next/link, but a page is prefetched when the pointer or focus reaches its link
// rather than as soon as the link scrolls into view. The sidebar alone has ~20
// links: viewport prefetching fetched every one of those pages (and their
// stylesheets) on each load and slowed the page actually being opened.
import NextLink from 'next/link';
import { useRouter } from 'next/navigation';
import type { ComponentProps } from 'react';

export default function Link({ onMouseEnter, onFocus, onTouchStart, ...props }: ComponentProps<typeof NextLink>) {
  const router = useRouter();
  const warm = () => { if (typeof props.href === 'string' && props.href.startsWith('/')) router.prefetch(props.href); };
  return (
    <NextLink
      prefetch={false}
      {...props}
      onMouseEnter={e => { warm(); onMouseEnter?.(e); }}
      onFocus={e => { warm(); onFocus?.(e); }}
      onTouchStart={e => { warm(); onTouchStart?.(e); }}
    />
  );
}
