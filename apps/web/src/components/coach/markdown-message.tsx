'use client';

// Renders the coach's reply as GitHub-flavoured markdown so lists, bold, headings,
// tables and code read like a real chat product rather than a raw text blob.
// Styled with the v6 tokens (styles/v6/ai.css, `.ai-md`); wide tables and code
// blocks scroll inside themselves. Links open safely in a new tab. Signed dollar
// amounts and R multiples are toned: profit green, loss red. Memoised on its text,
// so a streaming reply only re-renders the message that changed.
import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { bulletsToMarkdown, splitMoney } from '@/lib/coach-format';
import '@/styles/v6/ai.css';

type HNode = { type: string; tagName?: string; value?: string; children?: HNode[]; properties?: Record<string, unknown> };
const SKIP = new Set(['code', 'pre', 'a']);

/** rehype: wrap signed amounts in <span class="ai-up|ai-dn"> (never inside code or links). */
function rehypeMoney() {
  const walk = (node: HNode) => {
    if (!node.children || (node.tagName && SKIP.has(node.tagName))) return;
    const next: HNode[] = [];
    for (const c of node.children) {
      if (c.type === 'text' && c.value && /[+\-−–]/.test(c.value)) {
        for (const p of splitMoney(c.value)) {
          next.push(p.tone ? { type: 'element', tagName: 'span', properties: { className: [p.tone === 'up' ? 'ai-up' : 'ai-dn'] }, children: [{ type: 'text', value: p.text }] } : { type: 'text', value: p.text });
        }
      } else {
        walk(c);
        next.push(c);
      }
    }
    node.children = next;
  };
  return (tree: HNode) => walk(tree);
}

function MarkdownMessage({ content }: { content: string }) {
  return (
    <div className="coach-md ai-md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeMoney]}
        components={{
          h1: ({ children }) => <h3>{children}</h3>,
          h2: ({ children }) => <h3>{children}</h3>,
          h3: ({ children }) => <h4>{children}</h4>,
          a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>,
          table: ({ children }) => <div className="ai-md-tbl"><table>{children}</table></div>,
        }}
      >
        {bulletsToMarkdown(content)}
      </ReactMarkdown>
    </div>
  );
}

export default memo(MarkdownMessage);
