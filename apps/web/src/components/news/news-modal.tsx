'use client';

// News detail modal — opens when a headline is clicked. Shows the full summary,
// all AI enrichment (sentiment / relevance / impact / category / country), the
// outlets that carried the story, and a prominent link out to the source.
import { useEffect } from 'react';
import { X, ArrowUpRight, Circle } from '@phosphor-icons/react';
import NewsThumb from '@/components/news/news-thumb';
import type { NewsItem, Sentiment } from '@/lib/api';

const sentimentChip: Record<Sentiment, string> = {
  BULLISH: 'text-profit border-profit/40 bg-profit/10',
  BEARISH: 'text-loss border-loss/40 bg-loss/10',
  NEUTRAL: 'text-fg-3 border-border-strong bg-surface',
};

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" data-testid="news-modal">
      <button className="absolute inset-0 bg-black/60 backdrop-blur-sm" aria-label="Close" onClick={onClose} />
      <div className="relative w-full max-w-xl max-h-[88dvh] overflow-y-auto rounded-[var(--radius-card)] border border-border-strong bg-app shadow-2xl fade-up">
        {high && <div className="h-1 w-full bg-loss" />}
        <NewsThumb src={item.imageUrl} className="w-full aspect-video object-cover" />
        <div className="p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap text-[11px]">
              <span className="font-semibold tracking-wide text-fg-2">{item.source}</span>
              <span className="text-fg-3">· {fullTime(item.publishedAt)}</span>
              {item.country && <span className="text-base leading-none" title={item.country}>{flag(item.country)}</span>}
            </div>
            <button onClick={onClose} aria-label="Close" className="shrink-0 w-8 h-8 -mt-1 -mr-1 rounded-md border border-border-soft flex items-center justify-center text-fg-3 hover:text-fg hover:border-border-strong transition-colors">
              <X size={14} weight="bold" />
            </button>
          </div>

          {/* Tags */}
          <div className="flex items-center gap-1.5 flex-wrap mt-3 text-[10px]">
            {item.category && <span className="px-1.5 py-0.5 rounded border border-border-soft text-fg-3 tracking-wider uppercase">{item.category}</span>}
            {item.sentiment && <span className={`px-1.5 py-0.5 rounded border tracking-wider uppercase ${sentimentChip[item.sentiment]}`}>{item.sentiment}</span>}
            {high && <span className="px-1.5 py-0.5 rounded border border-loss/40 text-loss bg-loss/10 tracking-wider uppercase flex items-center gap-1"><Circle size={6} weight="fill" /> High impact</span>}
            {typeof item.relevance === 'number' && (
              <span className="flex items-center gap-1.5 text-fg-3 ml-auto" title={`Relevance ${item.relevance}/100`}>
                <span className="tracking-wider uppercase">Relevance</span>
                <span className="w-16 h-1.5 rounded-full bg-surface-active overflow-hidden"><span className="block h-full bg-profit/70" style={{ width: `${item.relevance}%` }} /></span>
                <span className="numeric text-fg-2">{item.relevance}</span>
              </span>
            )}
          </div>

          <h2 className="font-display font-bold text-[19px] leading-snug tracking-tight text-fg mt-4">{item.title}</h2>
          {item.summary && <p className="text-[13.5px] text-fg-2 leading-relaxed mt-3">{item.summary}</p>}

          {others.length > 0 && (
            <p className="text-[11px] text-fg-3 mt-4">Also reported by <span className="text-fg-2">{others.join(', ')}</span></p>
          )}

          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            data-testid="news-modal-source"
            className="btn btn-primary w-full justify-center mt-5 py-2.5 rounded-[var(--radius-btn)]"
          >
            Read full story at {item.source} <ArrowUpRight size={15} weight="bold" />
          </a>
          <p className="text-center text-[9px] tracking-[0.18em] uppercase text-fg-3 mt-3">Opens the original source · AI tags are informational</p>
        </div>
      </div>
    </div>
  );
}
