'use client';

import AppShell from '@/components/app-shell';
import EmptyState, { type EmptyIcon } from '@/components/v6/ui/empty-state';
import ErrorCard from '@/components/v6/ui/error-card';
import { SceneDisc, type SceneKind } from '@/components/v6/ui/scene-art';

const KINDS: SceneKind[] = ['search', 'signal', 'pulse', 'compare', 'bell', 'news', 'play', 'report', 'calendar', 'star', 'plug', 'lock', 'note', 'shield', 'chat'];

export default function ScenesGallery() {
  return (
    <AppShell legacy={false} pageTitle="Drawings">
      <div className="x-page">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 24 }}>
          {KINDS.map(k => <div key={k} style={{ display: 'grid', justifyItems: 'center', gap: 8 }}><SceneDisc kind={k} /><small>{k}</small></div>)}
        </div>
        <EmptyState icon={'bell' as EmptyIcon} title="No indicator alerts yet" hints={['RSI crosses below 30', 'Volume above its average']}
          actions={<><button className="x-btn x-btn--hi">Create your first alert</button><button className="x-btn">Pick a ready-made rule</button></>}>
          Get told the moment an indicator condition is met.
        </EmptyState>
        <ErrorCard message="Request failed (503)" onRetry={() => {}} />
        <ErrorCard message="Failed to fetch" onRetry={() => {}} />
        <ErrorCard message="Request failed (401)" compact />
      </div>
    </AppShell>
  );
}
