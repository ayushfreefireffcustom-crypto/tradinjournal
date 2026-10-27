'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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

  const CLASS: Record<string, string> = { crypto: 'Crypto', forex: 'Forex', stock: 'Stocks', commodity: 'Metals', broker: 'Broker' };
  return (
    <div className="sx-master" data-testid="trader-master">
      <div className="v3-card sx-bar">
        <div ref={searchWrap} className={`ch-search sx-search ${focused ? 'on' : ''}`}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" strokeLinecap="round" /></svg>
          <input value={query} onChange={e => { setQuery(e.target.value); setSymbol(''); setPicked(null); }}
            onFocus={() => { setFocused(true); if (results.length > 0) setShowResults(true); }} onBlur={() => setFocused(false)}
            onKeyDown={e => { if (e.key === 'Enter') void runAnalyze(); if (e.key === 'Escape') setShowResults(false); }}
            placeholder="Search a symbol — XAUUSD, BTCUSDT, EURUSD…" data-testid="trader-symbol-input" autoComplete="off" spellCheck={false} aria-label="Symbol" />
          {picked && !focused && query === picked.symbol && <span className="sx-pick" aria-hidden><b>{picked.symbol}</b> {picked.name} · {CLASS[picked.assetClass] ?? picked.assetClass}</span>}
          {showResults && focused && results.length > 0 && (
            <div className="ch-pop ch-results" role="listbox" data-testid="trader-search-results" style={{ width: '100%' }}>
              {results.map(s => (
                <button key={`${s.provider}:${s.symbol}`} type="button" role="option" aria-selected={false} onMouseDown={e => e.preventDefault()} onClick={() => pick(s)}>
                  <span>{s.symbol}<small>{s.name}</small></span><em>{CLASS[s.assetClass] ?? s.assetClass}</em>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="v3-seg sx-tf" role="group" aria-label="Timeframes (multi-select)">
          {TRADER_TIMEFRAMES.map(tf => (
            <button key={tf} type="button" onClick={() => toggleTf(tf)} aria-pressed={timeframes.includes(tf)} data-testid={`trader-tf-${tf}`}>{tf}</button>
          ))}
        </div>
        <button type="button" onClick={() => void runAnalyze()} disabled={analyzing || !(symbol || query).trim()} title={!(symbol || query).trim() ? 'Pick a symbol first' : undefined} className="mk-brief-btn sx-go" data-testid="trader-analyze">
          {analyzing ? <><Loader size={16} className="!gap-0" /> Analysing</> : <>⚡ Analyze</>}
        </button>
      </div>

      {error && <div className="d-err" role="alert" data-testid="trader-error"><span>{error}</span></div>}

      {analyzing && !analysis && (
        <div className="v3-card sx-busy" data-testid="trader-analyzing"><Loader size={22} /><span>Reading {(symbol || query).toUpperCase()} across {timeframes.join(', ')}…</span></div>
      )}

      {analysis && <div className={analyzing ? 'sx-dim' : ''}><AnalysisReport a={analysis} /></div>}

      {!analysis && !analyzing && !error && (
        <div className="v3-card sx-empty" data-testid="trader-empty">
          <b>Pick a symbol and timeframe</b>
          <p>SignalX returns a direction, entry zone, stop and three targets — then grades the call when the horizon closes.</p>
          <div>{['XAUUSD', 'BTCUSDT', 'EURUSD'].map(x => <button key={x} type="button" className="t-tag" onClick={() => { setQuery(x); setSymbol(x); }}>{x}</button>)}</div>
        </div>
      )}

      <AnalysisHistory refreshKey={historyKey} onSelect={a => { setAnalysis(a); setQuery(a.symbol); setSymbol(a.symbol); setPicked(null); }} />
    </div>
  );
}
