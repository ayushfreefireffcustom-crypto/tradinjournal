'use client';

// Renders the coach's reply as GitHub-flavoured markdown with themed typography,
// so lists, bold, headings, tables and code read like a real chat product rather
// than a raw text blob. Links open safely in a new tab. Kept intentionally small
// and styled with the app's tokens.
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function MarkdownMessage({ content }: { content: string }) {
  return (
    <div className="coach-md text-[13.5px] leading-[1.65] text-fg-2 break-words">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0">{children}</p>,
          strong: ({ children }) => <strong className="font-semibold text-fg">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          ul: ({ children }) => <ul className="my-2 pl-4 flex flex-col gap-1 list-disc marker:text-[#9479FF]">{children}</ul>,
          ol: ({ children }) => <ol className="my-2 pl-4 flex flex-col gap-1 list-decimal marker:text-fg-3">{children}</ol>,
          li: ({ children }) => <li className="pl-1">{children}</li>,
          h1: ({ children }) => <h3 className="mt-3 mb-1.5 font-display font-bold text-[15px] text-fg tracking-tight">{children}</h3>,
          h2: ({ children }) => <h3 className="mt-3 mb-1.5 font-display font-bold text-[14.5px] text-fg tracking-tight">{children}</h3>,
          h3: ({ children }) => <h4 className="mt-2.5 mb-1 font-semibold text-[13.5px] text-fg">{children}</h4>,
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-[#5733EE] underline underline-offset-2 hover:text-[#6E4BFF]">
              {children}
            </a>
          ),
          code: ({ children }) => (
            <code className="rounded-[6px] bg-app/70 border border-border-soft px-1.5 py-0.5 text-[12px] font-mono text-fg">{children}</code>
          ),
          pre: ({ children }) => (
            <pre className="my-2 overflow-x-auto rounded-[var(--radius-btn)] bg-app/70 border border-border-soft p-3 text-[12px] font-mono">{children}</pre>
          ),
          blockquote: ({ children }) => (
            <blockquote className="my-2 border-l-2 border-border-strong pl-3 text-fg-3 italic">{children}</blockquote>
          ),
          table: ({ children }) => (
            <div className="my-2 overflow-x-auto">
              <table className="w-full text-[12.5px] border-collapse">{children}</table>
            </div>
          ),
          th: ({ children }) => <th className="border border-border-soft px-2 py-1 text-left font-semibold text-fg">{children}</th>,
          td: ({ children }) => <td className="border border-border-soft px-2 py-1">{children}</td>,
          hr: () => <hr className="my-3 border-border-soft" />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
