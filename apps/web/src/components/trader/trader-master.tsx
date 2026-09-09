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
        return next.length ? next : cur;
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
      setError(e instanceof Error ? e.message : 'Analysis failed. Try another symbol or timeframe.');
    } finally {
      setAnalyzing(false);
    }
  }, [symbol, query, timeframes, onAnalyzed]);

  return (
    <div className="space-y-4" data-testid="trader-master">
      <div className="tcard p-4 space-y-3 relative overflow-hidden animate-[fade-up_0.4s_ease_both]">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-8 -top-10 size-40 rounded-full opacity-40"
          style={{
            background: 'radial-gradient(circle, color-mix(in oklab, var(--color-profit) 22%, transparent), transparent 70%)',
          }}
        />

        <div className="relative">
          <div className="flex items-center gap-2 bg-app/60 border border-border-soft focus-within:border-profit/40 focus-within:shadow-[0_0_0_3px] focus-within:shadow-profit/10 rounded-full px-3 py-2.5 transition-all duration-200">
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
            <ul
              className="absolute z-20 mt-1.5 w-full max-h-64 overflow-y-auto rounded-xl border border-border-soft bg-surface/95 backdrop-blur-md shadow-xl animate-[fade-up_0.2s_ease_both]"
              data-testid="trader-search-results"
            >
              {results.map((s) => (
                <li key={`${s.provider}:${s.symbol}`}>
                  <button
                    type="button"
                    onClick={() => pick(s)}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-surface-hover transition-colors"
                  >
                    <span className="numeric text-[12px] text-fg font-medium">{s.symbol}</span>
                    <span className="text-[11px] text-fg-3 truncate">{s.name}</span>
                    <span className="ml-auto text-[9px] tracking-[0.12em] uppercase text-fg-3">
                      {s.assetClass}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="relative flex items-center gap-2 flex-wrap">
          <span className="text-[10px] tracking-[0.14em] text-fg-3 uppercase">Timeframes</span>
          {TRADER_TIMEFRAMES.map((tf) => {
            const on = timeframes.includes(tf);
            return (
              <button
                key={tf}
                type="button"
                onClick={() => toggleTf(tf)}
                className={`numeric text-[11px] px-2.5 py-1 rounded-full border transition-all duration-150 ${
                  on
                    ? 'text-fg border-border-strong bg-surface-hover scale-[1.02]'
                    : 'text-fg-3 border-border-soft hover:text-fg-2 hover:border-border'
                }`}
                data-testid={`trader-tf-${tf}`}
                aria-pressed={on}
              >
                {tf}
              </button>
            );
          })}
          <span className="text-[10px] text-fg-3 ml-1">
            {timeframes.length > 1 ? 'multi-timeframe' : 'single'}
          </span>

          <button
            type="button"
            onClick={() => void runAnalyze()}
            disabled={analyzing}
            className="ml-auto btn px-4 py-2 text-[11px] tracking-[0.12em] uppercase bg-profit/15 text-profit border border-profit/30 hover:bg-profit/25 disabled:opacity-50 inline-flex items-center gap-1.5 transition-all"
            data-testid="trader-analyze"
          >
            {analyzing ? <Loader size={14} className="!gap-0" /> : <Lightning size={14} weight="fill" />}
            {analyzing ? 'Analyzing…' : 'Analyze'}
          </button>
        </div>
      </div>

      {error && (
        <div
          className="tcard p-3 text-loss text-sm animate-[shake_0.35s_ease]"
          role="alert"
          data-testid="trader-error"
        >
          {error}
        </div>
      )}

      {analyzing && !analysis && (
        <div className="tcard p-8 text-center text-fg-3 text-sm animate-[fade-up_0.3s_ease_both]" data-testid="trader-analyzing">
          <Loader size={20} />
          <p className="mt-2">Reading structure across your timeframes…</p>
        </div>
      )}

      {analysis && <AnalysisReport a={analysis} />}

      {!analysis && !analyzing && !error && (
        <div
          className="rounded-xl border border-dashed border-border-soft px-6 py-10 text-center text-fg-3 text-sm animate-[fade-up_0.45s_ease_both]"
          data-testid="trader-empty"
        >
          <p className="font-display font-bold text-fg-2 text-base">Ready when you are</p>
          <p className="mt-1.5 max-w-sm mx-auto leading-relaxed">
            Pick a symbol and timeframe, then hit Analyze — direction, entry, stop, and three targets from live structure.
          </p>
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
