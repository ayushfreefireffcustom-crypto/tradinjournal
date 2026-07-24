import { describe, it, expect } from 'vitest';
import { renderReviewHtml, weeklyReviewEmail } from '../templates.js';

// The review body is model-generated and lands in an HTML email. Escaping is the
// security property here: nothing the model emits may become live markup.

describe('renderReviewHtml', () => {
  it('escapes HTML so model output can never become markup', () => {
    const html = renderReviewHtml('<script>alert(1)</script>');
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('escapes attribute-breaking characters', () => {
    const html = renderReviewHtml('an "img" onerror=x & <b>bold</b>');
    expect(html).toContain('&quot;');
    expect(html).toContain('&amp;');
    expect(html).toContain('&lt;b&gt;');
    expect(html).not.toMatch(/<b>/);
  });

  it('renders **bold** as a styled <strong>', () => {
    expect(renderReviewHtml('**Overview**')).toContain('<strong');
    expect(renderReviewHtml('**Overview**')).toContain('Overview');
  });

  it('renders dash and asterisk bullets as a single list', () => {
    const html = renderReviewHtml('- first\n- second');
    expect((html.match(/<ul/g) ?? []).length).toBe(1);
    expect((html.match(/<li/g) ?? []).length).toBe(2);
    expect(renderReviewHtml('* only')).toContain('<li');
  });

  it('starts a new list after a blank line', () => {
    const html = renderReviewHtml('- a\n\ntext\n\n- b');
    expect((html.match(/<ul/g) ?? []).length).toBe(2);
  });

  it('emits paragraphs for prose and drops heading markers', () => {
    const html = renderReviewHtml('### Overview\nplain line');
    expect(html).toContain('<p');
    expect(html).not.toContain('###');
  });

  it('produces nothing for empty input', () => {
    expect(renderReviewHtml('')).toBe('');
    expect(renderReviewHtml('\n\n  \n')).toBe('');
  });
});

describe('weeklyReviewEmail', () => {
  const base = {
    name: 'Ayush Jo',
    weekLabel: '18 Jul – 24 Jul',
    sections: [{ label: 'EXNESS · #123', content: '**Overview**\n- did a thing' }],
    unsubscribeUrl: 'https://app.example.com/unsubscribe?token=abc',
  };

  it('greets by first name only and includes the week label', () => {
    const { html, subject } = weeklyReviewEmail(base);
    expect(html).toContain('Ayush');
    expect(html).not.toContain('Ayush Jo');
    expect(subject).toContain('18 Jul – 24 Jul');
  });

  it('always carries an unsubscribe link — this is recurring mail', () => {
    expect(weeklyReviewEmail(base).html).toContain(base.unsubscribeUrl);
  });

  it('escapes the account label as well as the body', () => {
    const html = weeklyReviewEmail({
      ...base,
      sections: [{ label: '<img src=x>', content: 'fine' }],
    }).html;
    expect(html).not.toContain('<img src=x>');
    expect(html).toContain('&lt;img');
  });

  it('renders one block per account', () => {
    const html = weeklyReviewEmail({
      ...base,
      sections: [
        { label: 'A · #1', content: 'first' },
        { label: 'B · #2', content: 'second' },
      ],
    }).html;
    expect(html).toContain('A · #1');
    expect(html).toContain('B · #2');
  });
});
