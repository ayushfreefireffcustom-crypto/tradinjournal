'use client';

import type { ReactNode } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// Wraps an analytics card so it can be dragged to reorder. Drag is initiated
// only from the handle (top-right, revealed on hover / focus) so page scroll
// and touch gestures over the card body are never hijacked.
export default function SortableCard({ id, className = '', children }: { id: string; className?: string; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 20 : undefined,
    opacity: isDragging ? 0.9 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-testid={`sortable-${id}`}
      className={`relative group h-full ${className} ${isDragging ? 'ring-1 ring-border-strong rounded-[var(--radius-card)]' : ''}`}
    >
      <button
        {...attributes}
        {...listeners}
        aria-label="Drag to reorder"
        data-testid={`drag-${id}`}
        className="absolute top-2.5 right-2.5 z-10 w-7 h-7 flex items-center justify-center rounded-md border border-border-soft bg-surface/90 backdrop-blur text-fg-3 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-fg hover:border-border-strong cursor-grab active:cursor-grabbing transition-opacity touch-none focus-ring"
      >
        <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor" aria-hidden>
          <circle cx="2" cy="2" r="1.3" /><circle cx="8" cy="2" r="1.3" />
          <circle cx="2" cy="7" r="1.3" /><circle cx="8" cy="7" r="1.3" />
          <circle cx="2" cy="12" r="1.3" /><circle cx="8" cy="12" r="1.3" />
        </svg>
      </button>
      {children}
    </div>
  );
}
