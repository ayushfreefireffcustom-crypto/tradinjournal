'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { MagnifyingGlass, Lightning } from '@phosphor-icons/react';
import { Loader } from '@/components/loader';
import { marketApi, type MarketSymbol } from '@/lib/market-api';
import { traderApi, TRADER_TIMEFRAMES, type TraderTimeframe, type TraderAnalysis } from '@/lib/trader-api';
import AnalysisReport from './analysis-report';

export default function TraderMaster() {
  const [query, setQuery] = useState('');
  const [symbol, setSymbol] = useState('');
  const [results, setResults] = useState<MarketSymbol[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [timeframes, setTimeframes] = useState<TraderTimeframe[]>(['1h']);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<TraderAnalysis | null>(null);
  const [error, setError] = useState('');
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced symbol search.
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    searchTimer.current = setTimeout(async () => {
      try {
        const { symbols } = await marketApi.search(q);
        setResults(symbols.slice(0, 8));
        setShowResults(true);
      } catch {
        setResults([]);
      }
    }, 250);
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current);
    };
  }, [query]);

  function pick(s: MarketSymbol) {
    setSymbol(s.symbol);
    setQuery(s.symbol);
    setShowResults(false);
  }

  function toggleTf(tf: TraderTimeframe) {
    setTimeframes((cur) => {
      if (cur.includes(tf)) {
        const next = cur.filter((t) => t !== tf);
        return next.length ? next : cur; // keep at least one
      }
      return [...cur, tf];
    });
  }

  const runAnalyze = useCallback(async () => {
    const sym = (symbol || query).trim().toUpperCase();
    if (!sym) {
      setError('Enter a symbol first (e.g. BTCUSDT, EURUSD, XAUUSD).');
      return;
    }
    // Analyze on the engine's own timeframe order.
    const order: TraderTimeframe[] = ['15m', '1h', '4h', '1d'];
    const tfs = order.filter((t) => timeframes.includes(t));
    setError('');
    setAnalyzing(true);
    setShowResults(false);
    try {
      const a = await traderApi.analyze(sym, tfs);
      setAnalysis(a);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Analysis failed. Try another symbol or timeframe.');
    } finally {
      setAnalyzing(false);
    }
  }, [symbol, query, timeframes]);

  return (
    <div className="space-y-4" data-testid="trader-master">
      {/* Controls */}
      <div className="tcard p-4 space-y-3">
        <div className="relative">
          <div className="flex items-center gap-2 bg-app/60 border border-border-soft focus-within:border-border-strong rounded-full px-3 py-2 transition-colors">
            <MagnifyingGlass size={16} className="shrink-0 text-fg-3" />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSymbol('');
              }}
              onFocus={() => results.length && setShowResults(true)}
              onKeyDown={(e) => e.key === 'Enter' && void runAnalyze()}
              placeholder="Search a symbol — BTCUSDT, EURUSD, XAUUSD, AAPL…"
              className="flex-1 min-w-0 bg-transparent text-[13px] text-fg placeholder:text-fg-3 outline-none"
              data-testid="trader-symbol-input"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          {showResults && results.length > 0 && (
            <ul className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto rounded-lg border border-border-soft bg-surface shadow-lg" data-testid="trader-search-results">
              {results.map((s) => (
                <li key={`${s.provider}:${s.symbol}`}>
                  <button
                    type="button"
                    onClick={() => pick(s)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-surface-hover"
                  >
                    <span className="numeric text-[12px] text-fg">{s.symbol}</span>
                    <span className="text-[11px] text-fg-3 truncate">{s.name}</span>
                    <span className="ml-auto text-[9px] tracking-[0.12em] uppercase text-fg-3">{s.assetClass}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Timeframe chips */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] tracking-[0.14em] text-fg-3 uppercase">Timeframes</span>
          {TRADER_TIMEFRAMES.map((tf) => {
            const on = timeframes.includes(tf);
            return (
              <button
                key={tf}
                type="button"
                onClick={() => toggleTf(tf)}
                className={`numeric text-[11px] px-2.5 py-1 rounded border transition-colors ${
                  on ? 'text-fg border-border-strong bg-surface-hover' : 'text-fg-3 border-border-soft hover:text-fg-2'
                }`}
                data-testid={`trader-tf-${tf}`}
                aria-pressed={on}
              >
                {tf}
              </button>
            );
          })}
          <span className="text-[10px] text-fg-3 ml-1">{timeframes.length > 1 ? 'multi-timeframe' : 'single'}</span>

          <button
            type="button"
            onClick={() => void runAnalyze()}
            disabled={analyzing}
            className="ml-auto btn px-4 py-2 text-[11px] tracking-[0.12em] uppercase bg-profit/15 text-profit border border-profit/30 disabled:opacity-50 inline-flex items-center gap-1.5"
            data-testid="trader-analyze"
          >
            {analyzing ? <Loader size={14} className="!gap-0" /> : <Lightning size={14} weight="fill" />}
            {analyzing ? 'Analyzing…' : 'Analyze'}
          </button>
        </div>
      </div>

      {error && (
        <div className="tcard p-3 text-loss text-sm" role="alert" data-testid="trader-error">
          {error}
        </div>
      )}

      {analyzing && !analysis && (
        <div className="tcard p-8 text-center text-fg-3 text-sm" data-testid="trader-analyzing">
          <Loader size={20} />
          <p className="mt-2">Reading the charts and computing levels…</p>
        </div>
      )}

      {analysis && !analyzing && <AnalysisReport a={analysis} />}

      {!analysis && !analyzing && !error && (
        <div className="tcard p-6 text-center text-fg-3 text-sm" data-testid="trader-empty">
          Pick a symbol and timeframe, then hit <span className="text-fg-2">Analyze</span> to get an AI trade breakdown —
          direction, entry, stop, and three targets from live market structure.
        </div>
      )}
    </div>
  );
}
