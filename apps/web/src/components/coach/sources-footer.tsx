'use client';

// Citation chips for the web results the coach used to ground an answer. Renders
// a tidy wrapped grid of pill links (globe + numbered index + domain), each
// opening the source in a new tab. Nothing external is fetched — the domain is
// parsed from the URL, so there are no favicon network calls.
import { Globe, ArrowUpRight } from '@phosphor-icons/react';
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
    <div className="mt-3 pt-2.5 border-t border-border-soft" data-testid="coach-sources">
      <div className="flex items-center gap-1.5 mb-2">
        <Globe size={12} weight="bold" className="text-fg-3" />
        <span className="text-[9px] tracking-[0.22em] text-fg-3">SOURCES · {sources.length}</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {sources.map((s, i) => (
          <a
            key={i}
            href={s.url}
            target="_blank"
            rel="noopener noreferrer"
            title={s.title}
            className="group inline-flex items-center gap-1.5 max-w-[240px] rounded-[var(--radius-pill)] border border-border-soft bg-app/50 px-2.5 py-1 text-[11px] text-fg-3 hover:border-profit/40 hover:text-fg transition-colors"
          >
            <span className="text-fg-3/60 group-hover:text-profit shrink-0">{i + 1}</span>
            <span className="truncate">{domainOf(s.url)}</span>
            <ArrowUpRight size={11} className="shrink-0 opacity-50 group-hover:opacity-100" />
          </a>
        ))}
      </div>
    </div>
  );
}
