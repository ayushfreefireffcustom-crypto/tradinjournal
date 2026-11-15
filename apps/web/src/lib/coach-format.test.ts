import { describe, expect, it } from 'vitest';
import { bulletsToMarkdown } from './coach-format';

describe('coach replies: "•" bullets become a markdown list', () => {
  it('stored fallback reply: bullets on their own lines, single newlines', () => {
    const s = "Here's what your data already shows:\n\n• Tue is your strongest day\n• Wed bleeds −$120";
    expect(bulletsToMarkdown(s)).toBe("Here's what your data already shows:\n\n- Tue is your strongest day\n- Wed bleeds −$120");
  });
  it('several bullets inline in one paragraph', () => {
    const s = 'What I see: • Tue is your strongest day • Wed bleeds −$120 • Fri is flat';
    expect(bulletsToMarkdown(s)).toBe('What I see:\n\n- Tue is your strongest day\n- Wed bleeds −$120\n- Fri is flat');
  });
  it('a paragraph after the list stays its own paragraph', () => {
    expect(bulletsToMarkdown('• a\n• b\nKeep logging.')).toBe('- a\n- b\n\nKeep logging.');
  });
  it('leaves normal markdown, a lone "•" separator, tables and code alone', () => {
    const md = 'Two things:\n\n- one\n- two\n\n**Bold** text.';
    expect(bulletsToMarkdown(md)).toBe(md);
    expect(bulletsToMarkdown('London • NY overlap is your best window')).toBe('London • NY overlap is your best window');
    const table = '| a • b • c | d |\n|---|---|';
    expect(bulletsToMarkdown(table)).toBe(table);
    const code = '```\n• x • y • z\n```';
    expect(bulletsToMarkdown(code)).toBe(code);
  });
});
