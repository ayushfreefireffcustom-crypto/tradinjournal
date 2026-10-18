'use client';

// Citation chips for the web results the coach used to ground an answer. Renders
// a tidy wrapped grid of pill links (globe + numbered index + domain), each
// opening the source in a new tab. Nothing external is fetched — the domain is
// parsed from the URL, so there are no favicon network calls.
import type { AiSource } from '@/lib/api';

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
    <div className="cf" data-testid="coach-sources">
      <span>Sources</span>
      {sources.map((s, i) => (
        <a key={i} href={s.url} target="_blank" rel="noopener noreferrer" title={s.title}><em>{i + 1}</em>{domainOf(s.url)} ↗</a>
      ))}
    </div>
  );
}
