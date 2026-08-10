'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { MacroState } from '@/lib/macro-api';
import { formatBiasLabel, formatIndicatorValue } from '@/lib/macro-format';

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

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (open) onClose();
        else document.dispatchEvent(new CustomEvent('macro-search-open'));
      }
      if (e.key === 'Escape' && open) onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const results = useMemo(() => {
    if (!state || !q.trim()) return { indicators: [], assets: [], events: [] };
    const needle = q.trim().toLowerCase();
    return {
      indicators: state.macro
        .filter(m => m.key.toLowerCase().includes(needle) || m.label.toLowerCase().includes(needle))
        .slice(0, 8),
      assets: state.bias
        .filter(b => b.asset.toLowerCase().includes(needle) || formatBiasLabel(b.label).toLowerCase().includes(needle))
        .slice(0, 8),
      events: state.events
        .filter(e => e.title.toLowerCase().includes(needle) || (e.country ?? '').toLowerCase().includes(needle))
        .slice(0, 8),
    };
  }, [state, q]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] px-4" data-testid="macro-search">
      <div className="absolute inset-0 bg-app/80 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div className="relative w-full max-w-xl tcard p-0 overflow-hidden fade-up shadow-[var(--shadow-md)]">
        <input
          autoFocus
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search indicators, assets, events…"
          className="w-full bg-transparent border-b border-border-soft px-4 py-3.5 text-[14px] text-fg outline-none"
          data-testid="macro-search-input"
        />
        <div className="max-h-[50vh] overflow-y-auto p-2 space-y-2">
          {!q.trim() && (
            <p className="text-[12px] text-fg-3 px-2 py-3">Type to search the live macro state. Esc to close.</p>
          )}

          {results.assets.length > 0 && (
            <div>
              <div className="text-[9px] tracking-[0.16em] text-fg-3 px-2 py-1">ASSETS</div>
              {results.assets.map(b => (
                <Link
                  key={b.asset}
                  href={`/macro/assets/${b.asset.toLowerCase()}`}
                  onClick={onClose}
                  className="flex items-center justify-between px-2 py-2 rounded-md hover:bg-surface-hover"
                >
                  <span className="text-[13px] text-fg">{b.asset}</span>
                  <span className="text-[11px] text-fg-3">{formatBiasLabel(b.label)} · {b.score}</span>
                </Link>
              ))}
            </div>
          )}

          {results.indicators.length > 0 && (
            <div>
              <div className="text-[9px] tracking-[0.16em] text-fg-3 px-2 py-1">INDICATORS</div>
              {results.indicators.map(m => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => { onNavigate('dashboard'); onClose(); }}
                  className="w-full flex items-center justify-between px-2 py-2 rounded-md hover:bg-surface-hover text-left"
                >
                  <span className="text-[13px] text-fg">{m.label}</span>
                  <span className="text-[11px] text-fg-3 numeric">{formatIndicatorValue(m.value, m.unit)}</span>
                </button>
              ))}
            </div>
          )}

          {results.events.length > 0 && (
            <div>
              <div className="text-[9px] tracking-[0.16em] text-fg-3 px-2 py-1">EVENTS</div>
              {results.events.map((e, i) => (
                <button
                  key={`${e.title}-${i}`}
                  type="button"
                  onClick={() => { onNavigate('calendar'); onClose(); }}
                  className="w-full flex items-center justify-between px-2 py-2 rounded-md hover:bg-surface-hover text-left gap-2"
                >
                  <span className="text-[13px] text-fg truncate">{e.title}</span>
                  <span className="text-[11px] text-fg-3 shrink-0">{e.country ?? '—'}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="border-t border-border-soft px-3 py-2 text-[10px] text-fg-3 flex justify-between">
          <span>⌘K / Ctrl+K</span>
          <span>Esc close</span>
        </div>
      </div>
    </div>
  );
}
