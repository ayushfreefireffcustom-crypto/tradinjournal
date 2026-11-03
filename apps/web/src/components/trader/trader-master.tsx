'use client';

import EmptyState from '@/components/v6/ui/empty-state';
import { useCallback, useEffect, useRef, useState } from 'react';
import { marketApi, type MarketSymbol } from '@/lib/market-api';
import {
  traderApi,
  TRADER_TIMEFRAMES,
  type TraderTimeframe,
  type TraderAnalysis,
} from '@/lib/trader-api';
import { IScan, ISearchLine, Spinner } from '@/components/v6/ai/bits';
import AnalysisReport from './analysis-report';
import AnalysisHistory from './history-list';

const CLASS: Record<string, string> = { crypto: 'Crypto', forex: 'Forex', stock: 'Stocks', commodity: 'Metals', broker: 'Broker' };
const ORDER: TraderTimeframe[] = ['15m', '1h', '4h', '1d'];

export default function TraderMaster({
  onAnalyzed,
}: {
  onAnalyzed?: () => void;
}) {
  const [query, setQuery] = useState('');
  const [symbol, setSymbol] = useState('');
  const [results, setResults] = useState<MarketSymbol[]>([]);
  const [picked, setPicked] = useState<MarketSymbol | null>(null);
  const [focused, setFocused] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [timeframes, setTimeframes] = useState<TraderTimeframe[]>(['1h']);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<TraderAnalysis | null>(null);
  const [error, setError] = useState('');
  const [historyKey, setHistoryKey] = useState(0);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchWrap = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    const q = query.trim();
    // Don't reopen the list right after a pick (query becomes the symbol).
    if (picked && q === picked.symbol) { setShowResults(false); return; }
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
  }, [query, picked]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!searchWrap.current?.contains(e.target as Node)) setShowResults(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  function pick(s: MarketSymbol) {
    setPicked(s);
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
    setShowResults(false);
    const tfs = ORDER.filter((t) => timeframes.includes(t));
    setError('');
    setAnalyzing(true);
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

  const hasSym = !!(symbol || query).trim();
  const tfLabel = ORDER.filter(t => timeframes.includes(t)).join(', ');
  return (
    <div className="ai-col" data-testid="trader-master">
      <section className="x-card" aria-labelledby="ai-an-t">
        <div className="x-ch"><h2 id="ai-an-t">Analyse a symbol</h2><span className="x-sub">pick one or more timeframes</span></div>
        <div className="ai-bar">
          <div ref={searchWrap} className="x-search ai-sym">
            <ISearchLine size={16} />
            <input ref={inputRef} className="x-input" value={query} onChange={e => { setQuery(e.target.value); setSymbol(''); setPicked(null); }}
              onFocus={() => { setFocused(true); if (results.length > 0) setShowResults(true); }} onBlur={() => setFocused(false)}
              onKeyDown={e => { if (e.key === 'Enter') void runAnalyze(); if (e.key === 'Escape') setShowResults(false); }}
              placeholder="XAUUSD, BTCUSDT, EURUSD…" data-testid="trader-symbol-input" autoComplete="off" spellCheck={false} aria-label="Symbol"
              aria-expanded={showResults && focused && results.length > 0} aria-controls="ai-sym-results" role="combobox" />
            {picked && !focused && query === picked.symbol && (
              <span className="ai-pick ai-ell" aria-hidden><b>{picked.symbol}</b><small>{picked.name} · {CLASS[picked.assetClass] ?? picked.assetClass}</small></span>
            )}
            {showResults && focused && results.length > 0 && (
              <div className="x-pop ai-results" role="listbox" id="ai-sym-results" data-testid="trader-search-results">
                {results.map(s => (
                  <button key={`${s.provider}:${s.symbol}`} type="button" role="option" aria-selected={false} onMouseDown={e => e.preventDefault()} onClick={() => pick(s)}>
                    <span className="ai-ell"><b>{s.symbol}</b><small className="ai-ell">{s.name}</small></span><em>{CLASS[s.assetClass] ?? s.assetClass}</em>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="x-seg" role="group" aria-label="Timeframes (multi-select)">
            {TRADER_TIMEFRAMES.map(tf => (
              <button key={tf} type="button" onClick={() => toggleTf(tf)} aria-pressed={timeframes.includes(tf)} data-testid={`trader-tf-${tf}`}>{tf}</button>
            ))}
          </div>
          <button type="button" onClick={() => void runAnalyze()} disabled={analyzing || !hasSym} title={!hasSym ? 'Pick a symbol first' : undefined} className="x-btn x-btn--hi" data-testid="trader-analyze">
            {analyzing ? <><Spinner size={15} /> Analysing</> : <><IScan size={16} /> Analyse</>}
          </button>
        </div>
      </section>

      {error && (
        <div className="x-banner x-banner--err" role="alert" data-testid="trader-error">
          <span>{error}</span>
          {hasSym && <button type="button" className="x-btn x-btn--sm" onClick={() => void runAnalyze()} disabled={analyzing}>Try again</button>}
        </div>
      )}

      {analyzing && !analysis && (
        <section className="x-card ai-busy" data-testid="trader-analyzing" aria-live="polite">
          <div className="ai-busy-hd"><Spinner size={16} /><span>Reading {(symbol || query).toUpperCase()} across {tfLabel}…</span></div>
          <div className="ai-busy-sk">{[0, 1, 2, 3, 4].map(i => <i key={i} className="x-skel x-skel--in" />)}</div>
          <i className="x-skel x-skel--in ai-busy-ch" />
        </section>
      )}

      {analysis && <AnalysisReport a={analysis} dim={analyzing} />}

      {!analysis && !analyzing && !error && (
        <section className="x-card">
          <EmptyState icon="signal" ghost="chart" testId="trader-empty" title="Pick a symbol and timeframe"
            actions={<>{['XAUUSD', 'BTCUSDT', 'EURUSD'].map(x => (
              <button key={x} type="button" className="x-btn x-btn--sm" onClick={() => { setQuery(x); setSymbol(x); setPicked(null); }}>{x}</button>
            ))}</>}>
            SignalX returns a direction, entry zone, stop and three targets, then grades the call when the horizon closes.
          </EmptyState>
        </section>
      )}

      <AnalysisHistory refreshKey={historyKey} onSelect={a => { setAnalysis(a); setQuery(a.symbol); setSymbol(a.symbol); setPicked(null); }} />
    </div>
  );
}
