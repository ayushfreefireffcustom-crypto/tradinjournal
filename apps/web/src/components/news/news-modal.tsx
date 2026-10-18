'use client';

// News detail modal — opens when a headline is clicked. Shows the full summary,
// all AI enrichment (sentiment / relevance / impact / category / country), the
// outlets that carried the story, and a prominent link out to the source.
import { useEffect } from 'react';
import { IClose } from '@/components/v3/icons';
import NewsThumb from '@/components/news/news-thumb';
import type { NewsItem, Sentiment } from '@/lib/api';

const SENT: Record<Sentiment, [string, string]> = { BULLISH: ['g', 'Bullish'], BEARISH: ['r', 'Bearish'], NEUTRAL: ['v', 'Neutral'] };
const CAT: Record<string, string> = { CRYPTO: 'Crypto', MACRO: 'Macro', GEOPOLITICAL: 'Geopolitical', REGULATORY: 'Regulatory', MARKETS: 'Markets' };

function flag(cc: string | null): string {
  if (!cc || !/^[A-Z]{2}$/i.test(cc)) return '';
  return String.fromCodePoint(...[...cc.toUpperCase()].map(ch => 0x1f1e6 + ch.charCodeAt(0) - 65));
}

function fullTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function NewsModal({ item, onClose }: { item: NewsItem; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const high = item.impact === 'HIGH' || item.marketMoving;
  const others = item.outlets.filter(o => o !== item.source);

  return (
    <div className="v3 v3-modal" role="dialog" aria-modal="true" aria-labelledby="nm-t" data-testid="news-modal">
      <div className="v3-modal-bg" onClick={onClose} />
      <div className="v3-modal-card nm-card">
        <NewsThumb src={item.imageUrl} className="nm-img" />
        <div className="nm-bd">
          <div className="nm-top">
            <span className="mk-meta"><span className="src">{item.source} · {fullTime(item.publishedAt)}</span>{item.country && <span title={item.country}>{flag(item.country)}</span>}</span>
            <button onClick={onClose} aria-label="Close" className="v3-modal-x"><IClose size={16} /></button>
          </div>
          <div className="mk-meta" style={{ marginTop: 12 }}>
            {item.sentiment && <span className={`v3-pill ${SENT[item.sentiment][0]}`}>{SENT[item.sentiment][1]}</span>}
            {high && <span className="v3-pill r">High impact</span>}
            {item.category && <span className="cat">{CAT[item.category]}</span>}
          </div>
          <h2 id="nm-t">{item.title}</h2>
          {item.summary && <p className="nm-sum">{item.summary}</p>}
          {typeof item.relevance === 'number' && (
            <div className="nm-rel"><span>Relevance to traders</span><span className="mk-rel" style={{ flex: 1, marginTop: 0 }}><i style={{ width: `${item.relevance}%` }} /></span><b className="num">{item.relevance}</b></div>
          )}
          {others.length > 0 && <p className="nm-also">Also reported by {others.join(', ')}</p>}
          <a href={item.url} target="_blank" rel="noopener noreferrer" data-testid="news-modal-source" className="v3-btn v3-btn--ink nm-go">
            <span>Read at {item.source}</span><span className="ar"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M7 17L17 7M9 7h8v8" /></svg></span>
          </a>
          <p className="nm-note">Opens the original source · AI tags are informational</p>
        </div>
      </div>
    </div>
  );
}
