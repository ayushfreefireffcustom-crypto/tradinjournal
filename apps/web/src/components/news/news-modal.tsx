'use client';

// News detail modal: opens when a headline is clicked. Shows the full summary,
// all AI enrichment (sentiment / relevance / impact / category / country), the
// outlets that carried the story, and a prominent link out to the source.
import NewsThumb from '@/components/news/news-thumb';
import MkDialog, { MkClose } from '@/components/v6/markets/dialog';
import type { NewsItem, Sentiment } from '@/lib/api';

const SENT: Record<Sentiment, [string, string]> = { BULLISH: ['x-tag--g', 'Bullish'], BEARISH: ['x-tag--r', 'Bearish'], NEUTRAL: ['', 'Neutral'] };
const CAT: Record<string, string> = { CRYPTO: 'Crypto', MACRO: 'Macro', GEOPOLITICAL: 'Geopolitical', REGULATORY: 'Regulatory', MARKETS: 'Markets' };

function fullTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function NewsModal({ item, onClose }: { item: NewsItem; onClose: () => void }) {
  const high = item.impact === 'HIGH' || item.marketMoving;
  const others = item.outlets.filter(o => o !== item.source);
  const cc = item.country && /^[A-Z]{2}$/i.test(item.country) ? item.country.toUpperCase() : null;

  return (
    <MkDialog onClose={onClose} labelledBy="mk-nm-t" testId="news-modal" className="mk-dlg--wide">
      <NewsThumb src={item.imageUrl} className="mk-nm-img" />
      <div className="mk-dh">
        <div className="mk-dh-m">
          <span className="mk-item-meta">
            {cc && <span className="mk-cc m" title={`Country: ${cc}`}>{cc}</span>}
            <span className="mk-ell">{item.source} · {fullTime(item.publishedAt)}</span>
          </span>
        </div>
        <MkClose onClose={onClose} />
      </div>
      <div className="mk-nm-tags">
        {high && <span className="mk-hi"><i className="x-dot x-dot--r" aria-hidden />High impact</span>}
        {item.sentiment && <span className={`x-tag ${SENT[item.sentiment][0]}`}>{SENT[item.sentiment][1]}</span>}
        {item.category && <span className="x-tag">{CAT[item.category]}</span>}
      </div>
      <h2 id="mk-nm-t" className="mk-nm-t">{item.title}</h2>
      {item.summary && <p className="mk-nm-sum">{item.summary}</p>}
      {typeof item.relevance === 'number' && (
        <div className="mk-nm-rel"><span className="x-muted">Relevance to traders</span><span className="x-bar"><i style={{ width: `${item.relevance}%` }} /></span><b className="m">{item.relevance}</b></div>
      )}
      {others.length > 0 && <p className="mk-nm-also">Also reported by {others.join(', ')}</p>}
      <a href={item.url} target="_blank" rel="noopener noreferrer" data-testid="news-modal-source" className="x-btn x-btn--hi x-btn--lg x-btn--full">
        Read at {item.source}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><path d="M7 17L17 7M9 7h8v8" /></svg>
      </a>
      <p className="mk-nm-note">Opens the original source · AI tags are informational</p>
    </MkDialog>
  );
}
