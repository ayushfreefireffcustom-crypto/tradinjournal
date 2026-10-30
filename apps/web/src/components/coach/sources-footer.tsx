'use client';

// Citation chips for the web results the coach used to ground an answer: numbered
// tags with the source's domain, each opening in a new tab. Nothing external is
// fetched — the domain is parsed from the URL, so there are no favicon calls.
import type { AiSource } from '@/lib/api';
import { IExt } from '@/components/v6/ai/bits';

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export default function SourcesFooter({ sources }: { sources: AiSource[] }) {
  if (sources.length === 0) return null;
  return (
    <div className="ai-src" data-testid="coach-sources">
      <span>Sources</span>
      {sources.map((s, i) => (
        <a key={i} className="x-tag" href={s.url} target="_blank" rel="noopener noreferrer" title={s.title}>
          <em>{i + 1}</em><span>{domainOf(s.url)}</span><IExt />
        </a>
      ))}
    </div>
  );
}
