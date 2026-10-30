'use client';

// Renders the coach's reply as GitHub-flavoured markdown so lists, bold, headings,
// tables and code read like a real chat product rather than a raw text blob.
// Styled with the v6 tokens (styles/v6/ai.css, `.ai-md`); wide tables and code
// blocks scroll inside themselves. Links open safely in a new tab.
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import '@/styles/v6/ai.css';

export default function MarkdownMessage({ content }: { content: string }) {
  return (
    <div className="coach-md ai-md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => <h3>{children}</h3>,
          h2: ({ children }) => <h3>{children}</h3>,
          h3: ({ children }) => <h4>{children}</h4>,
          a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>,
          table: ({ children }) => <div className="ai-md-tbl"><table>{children}</table></div>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
