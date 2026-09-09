'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { MagnifyingGlass, Lightning } from '@phosphor-icons/react';
import { Loader } from '@/components/loader';
import { marketApi, type MarketSymbol } from '@/lib/market-api';
import {
  traderApi,
  TRADER_TIMEFRAMES,
  type TraderTimeframe,
  type TraderAnalysis,
} from '@/lib/trader-api';
import AnalysisReport from './analysis-report';
import AnalysisHistory from './history-list';

export default function TraderMaster({
  onAnalyzed,
}: {
  onAnalyzed?: () => void;
}) {
  const [query, setQuery] = useState('');
  const [symbol, setSymbol] = useState('');
  const [results, setResults] = useState<MarketSymbol[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [timeframes, setTimeframes] = useState<TraderTimeframe[]>(['1h']);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<TraderAnalysis | null>(null);
  const [error, setError] = useState('');
  const [historyKey, setHistoryKey] = useState(0);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchWrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setShowResults(false);
      return;
    }
    searchTimer.current = setTimeout(async () => {
      try {
        const { symbols } = await marketApi.search(q);
        setResults(symbols.slice(0, 8));
        setShowResults(true);
      } catch {
        setResults([]);
        setShowResults(false);
      }
    }, 220);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [query]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!searchWrap.current?.contains(e.target as Node)) setShowResults(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  function pick(s: MarketSymbol) {
    setSymbol(s.symbol);
    setQuery(s.symbol);
    setShowResults(false);
  }

  function toggleTf(tf: TraderTimeframe) {
    setTimeframes((cur) => {
      if (cur.includes(tf)) {
        const next = cur.filter((t) => t !== tf);
        return next.length ? next : cur;
      }
      return [...cur, tf];
    });
  }

  const runAnalyze = useCallback(async () => {
    const sym = (symbol || query).trim().toUpperCase();
    if (!sym) {
      setError('Enter a symbol first.');
      return;
    }
    const order: TraderTimeframe[] = ['15m', '1h', '4h', '1d'];
    const tfs = order.filter((t) => timeframes.includes(t));
    setError('');
    setAnalyzing(true);
    setShowResults(false);
    try {
      const a = await traderApi.analyze(sym, tfs);
      setAnalysis(a);
      setHistoryKey((k) => k + 1);
      onAnalyzed?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Analysis failed.');
    } finally {
      setAnalyzing(false);
    }
  }, [symbol, query, timeframes, onAnalyzed]);

  return (
    <div className="space-y-3" data-testid="trader-master">
      {/* Search + TF — overflow visible so the popover isn’t clipped */}
      <div className="rounded-xl border border-border bg-surface p-3 sm:p-3.5 space-y-3 overflow-visible relative z-30 shadow-sm animate-[fade-up_0.35s_ease_both]">
        <div ref={searchWrap} className="relative">
          <div className="flex items-center gap-2 h-10 rounded-lg border border-border bg-app px-3 transition-colors focus-within:border-border-strong focus-within:ring-2 focus-within:ring-white/10">
            <MagnifyingGlass size={15} className="shrink-0 text-fg-2" />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSymbol('');
              }}
              onFocus={() => results.length > 0 && setShowResults(true)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void runAnalyze();
                if (e.key === 'Escape') setShowResults(false);
              }}
              placeholder="Search symbol…"
              className="flex-1 min-w-0 bg-transparent text-sm text-fg placeholder:text-fg-3 outline-none"
              data-testid="trader-symbol-input"
              autoComplete="off"
              spellCheck={false}
            />
          </div>

          {showResults && results.length > 0 && (
            <ul
              role="listbox"
              className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 max-h-72 overflow-y-auto rounded-lg border border-border-strong bg-[#1a1a1a] shadow-lg ring-1 ring-white/10 animate-[fade-up_0.15s_ease_both]"
              data-testid="trader-search-results"
            >
              {results.map((s, i) => (
                <li key={`${s.provider}:${s.symbol}`} role="option">
                  <button
                    type="button"
                    onClick={() => pick(s)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-white/10 ${
                      i > 0 ? 'border-t border-border' : ''
                    }`}
                  >
                    <span className="font-medium text-sm text-white tabular-nums">{s.symbol}</span>
                    <span className="text-xs text-zinc-400 truncate flex-1">{s.name}</span>
                    <span className="text-[10px] uppercase tracking-wider text-zinc-500 shrink-0">
                      {s.assetClass}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {TRADER_TIMEFRAMES.map((tf) => {
            const on = timeframes.includes(tf);
            return (
              <button
                key={tf}
                type="button"
                onClick={() => toggleTf(tf)}
                className={`h-8 px-3 rounded-md text-xs tabular-nums transition-colors ${
                  on
                    ? 'bg-white text-black font-medium'
                    : 'bg-transparent text-fg-2 border border-border hover:text-fg hover:border-border-strong'
                }`}
                data-testid={`trader-tf-${tf}`}
                aria-pressed={on}
              >
                {tf}
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => void runAnalyze()}
            disabled={analyzing}
            className="ml-auto h-8 px-4 rounded-md text-xs font-medium bg-profit text-black hover:brightness-110 disabled:opacity-50 inline-flex items-center gap-1.5 transition-all"
            data-testid="trader-analyze"
          >
            {analyzing ? <Loader size={14} className="!gap-0" /> : <Lightning size={13} weight="fill" />}
            {analyzing ? '…' : 'Analyze'}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-loss/30 bg-loss/10 px-3 py-2 text-sm text-loss" role="alert" data-testid="trader-error">
          {error}
        </div>
      )}

      {analyzing && !analysis && (
        <div className="rounded-xl border border-border bg-surface py-12 flex flex-col items-center gap-2 text-fg-3 text-sm" data-testid="trader-analyzing">
          <Loader size={18} />
          <span>Analyzing…</span>
        </div>
      )}

      {analysis && <AnalysisReport a={analysis} />}

      {!analysis && !analyzing && !error && (
        <div
          className="rounded-xl border border-dashed border-border px-4 py-12 text-center text-sm text-fg-3"
          data-testid="trader-empty"
        >
          Search a symbol and analyze.
        </div>
      )}

      <AnalysisHistory
        refreshKey={historyKey}
        onSelect={(a) => {
          setAnalysis(a);
          setQuery(a.symbol);
          setSymbol(a.symbol);
        }}
      />
    </div>
  );
}
