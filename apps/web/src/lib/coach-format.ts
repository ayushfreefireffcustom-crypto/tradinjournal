// Coach reply clean-up before markdown rendering. Pure; unit-tested.

/**
 * Turns "•"-bulleted text into a markdown list. Older fallback replies were
 * stored as "• one\n• two" (single newlines), which markdown folds into one
 * paragraph, and some put several "• " items on one line. Both become
 * "- one\n- two", with blank lines around the list. Code blocks, tables and
 * normal markdown are left alone, and so is a single "•" used as a separator
 * inside a sentence ("A • B").
 */
export function bulletsToMarkdown(text: string): string {
  if (!text.includes('•')) return text;
  const out: string[] = [];
  let fence = false;
  let inList = false;
  const push = (line: string) => {
    // A paragraph right after our list would be folded into its last item.
    if (inList && line.trim() !== '') out.push('');
    inList = false;
    out.push(line);
  };
  for (const line of text.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) { fence = !fence; push(line); continue; }
    if (fence || /^\s*\|/.test(line)) { push(line); continue; }
    const starts = /^\s*•\s+/.test(line);
    const parts = line.split(/\s*•\s+/);
    // Not a bullet line: no leading "•" and fewer than two inline items.
    if (!starts && parts.length < 3) { push(line); continue; }
    const lead = parts.shift()!.trim();
    const items = parts.map(p => p.trim()).filter(Boolean);
    if (lead) push(lead);
    // A list needs a blank line before it, unless it continues one.
    const prev = out.at(-1);
    if (!inList && prev != null && prev.trim() !== '') out.push('');
    for (const it of items) out.push(`- ${it}`);
    inList = items.length > 0;
  }
  return out.join('\n');
}
