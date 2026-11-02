'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from '@/components/v6/ui/link';
import type { MacroState } from '@/lib/macro-api';
import { biasTone, formatIndicatorValue } from '@/lib/macro-format';
import { BiasTag, ISearch, sentence } from '@/components/v6/macro/ui';
import { useDialog } from '@/components/v6/ui/use-dialog';

interface Props {
  open: boolean;
  onClose: () => void;
  state: MacroState | null;
  onNavigate: (panel: string) => void;
}

/** Cmd-K style search across indicators, assets, events. */
export default function MacroSearch({ open, onClose, state, onNavigate }: Props) {
  const [q, setQ] = useState('');

  useEffect(() => {
    if (!open) setQ('');
  }, [open]);

  // ⌘K is the app-wide palette on every page, this one included; the macro search opens from its button.
  const ref = useDialog({ open, onClose });

  const results = useMemo(() => {
    if (!state || !q.trim()) return { indicators: [], assets: [], events: [] };
    const needle = q.trim().toLowerCase();
    return {
      indicators: state.macro
        .filter(m => m.key.toLowerCase().includes(needle) || m.label.toLowerCase().includes(needle))
        .slice(0, 8),
      assets: state.bias
        .filter(b => b.asset.toLowerCase().includes(needle) || b.label.replace(/_/g, ' ').toLowerCase().includes(needle))
        .slice(0, 8),
      events: state.events
        .filter(e => e.title.toLowerCase().includes(needle) || (e.country ?? '').toLowerCase().includes(needle))
        .slice(0, 8),
    };
  }, [state, q]);

  if (!open) return null;
  const none = q.trim() && !results.assets.length && !results.indicators.length && !results.events.length;

  return (
    <div className="x-dialog-scrim mc-sscrim" data-testid="macro-search" onMouseDown={onClose}>
      <div ref={ref} className="mc-sdlg" role="dialog" aria-modal="true" aria-label="Search macro" onMouseDown={e => e.stopPropagation()}>
        <div className="mc-sin">
          <ISearch size={17} />
          <input
            autoFocus
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search indicators, assets, events"
            aria-label="Search indicators, assets, events"
            data-testid="macro-search-input"
          />
          <kbd>Esc</kbd>
        </div>
        <div className="mc-sres">
          {!q.trim() && <p className="mc-shint">Type to search the live macro state.</p>}
          {none && <p className="mc-shint">Nothing matches “{q.trim()}”.</p>}

          {results.assets.length > 0 && (
            <div className="mc-sgrp">
              <small>Assets</small>
              {results.assets.map(b => (
                <Link key={b.asset} href={`/macro/assets/${b.asset.toLowerCase()}`} onClick={onClose}>
                  <span className="mc-st">{b.asset}</span>
                  <span className="mc-sr"><BiasTag tone={biasTone(b.label)} label={sentence(b.label)} /><span className="m">{b.score}</span></span>
                </Link>
              ))}
            </div>
          )}

          {results.indicators.length > 0 && (
            <div className="mc-sgrp">
              <small>Indicators</small>
              {results.indicators.map(m => (
                <button key={m.key} type="button" onClick={() => { onNavigate('dashboard'); onClose(); }}>
                  <span className="mc-st">{m.label}</span>
                  <span className="mc-sr m">{formatIndicatorValue(m.value, m.unit)}</span>
                </button>
              ))}
            </div>
          )}

          {results.events.length > 0 && (
            <div className="mc-sgrp">
              <small>Events</small>
              {results.events.map((e, i) => (
                <button key={`${e.title}-${i}`} type="button" onClick={() => { onNavigate('calendar'); onClose(); }}>
                  <span className="mc-st">{e.title}</span>
                  <span className="mc-sr x-muted">{e.country ?? '—'}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="mc-sft"><span><kbd>⌘K</kbd> or <kbd>Ctrl K</kbd> to toggle</span><span><kbd>Esc</kbd> to close</span></div>
      </div>
    </div>
  );
}
