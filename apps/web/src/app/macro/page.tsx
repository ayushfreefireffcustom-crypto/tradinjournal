'use client';

// Macro terminal (segment shell). P0 is a placeholder that loads the (empty)
// state so the page + client are wired end-to-end. P1–P3 fill in the dashboard,
// bias scanner, signals, and assistant.
import { useEffect, useState } from 'react';
import AppShell from '@/components/app-shell';
import { macroApi, type MacroState } from '@/lib/macro-api';

export default function MacroPage() {
  const [state, setState] = useState<MacroState | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    macroApi
      .state()
      .then(setState)
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load macro state'));
  }, []);

  return (
    <AppShell pageTitle="Macro" pageSubtitle="// GLOBAL MACRO">
      <div className="p-4 sm:p-6" data-testid="macro-page">
        <div className="tcard p-6 max-w-2xl">
          <div className="text-[10px] tracking-[0.25em] text-fg-3">// MACRO TERMINAL</div>
          <h1 className="font-display font-black text-2xl tracking-tight mt-1">Global Macro</h1>
          <p className="text-fg-3 text-sm mt-2">
            The macro intelligence terminal is being wired up — live indicators, per-asset bias scores,
            trade signals, and an AI assistant land in the next phases.
          </p>
          {error && <p className="text-loss text-sm mt-3" data-testid="macro-error">{error}</p>}
          {state && (
            <p className="text-fg-3 text-[11px] mt-4 numeric" data-testid="macro-state-line">
              engine {state.engineVer} · {state.macro.length} indicators · {state.markets.length} markets · updated{' '}
              {new Date(state.asOf).toLocaleTimeString()}
            </p>
          )}
        </div>
      </div>
    </AppShell>
  );
}
