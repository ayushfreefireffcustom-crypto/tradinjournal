// Render smoke tests for the shared v6 primitives (A2.29): each renders on the
// server without throwing and carries the markup its styles and a11y rely on.
// No DOM library: react-dom/server only, so this runs in the node test env.
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import Sparkline from './sparkline';
import IconButton from './icon-button';
import Tooltip from './tooltip';
import InfoTip from './info-tip';
import Freshness from './freshness';
import DateRangePicker from './date-range';
import CommandPalette from '../command-palette';
import { placeTip } from './tooltip';

const html = (el: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(el);

describe('Sparkline', () => {
  it('draws a decorative line coloured by direction', () => {
    const out = html(h(Sparkline, { values: [1, 2, 3], width: 60, height: 20 }));
    expect(out).toMatch(/^<svg class="x-spark /);
    expect(out).toContain('aria-hidden="true"');
    expect(out).toContain('stroke="var(--g)"');
    expect(out).toContain('data-dir="up"');
  });
  it('names itself when given a label, and keeps a zero line', () => {
    const out = html(h(Sparkline, { values: [3, -1], zero: true, label: 'Expectancy, last 20 trades' }));
    expect(out).toContain('role="img"');
    expect(out).toContain('aria-label="Expectancy, last 20 trades"');
    expect(out).toContain('stroke="var(--grid)"');
    expect(out).toContain('stroke="var(--r)"');
  });
  it('shows an empty baseline instead of a fake line', () => {
    const out = html(h(Sparkline, { values: [5] }));
    expect(out).toContain('x-spark--empty');
    expect(out).not.toContain('<path');
  });
  it('honours a forced tone and the soft fill', () => {
    const out = html(h(Sparkline, { values: [1, 2], tone: 'flat', area: true, fluid: true }));
    expect(out).toContain('stroke="var(--mut)"');
    expect(out).toContain('fill-opacity=".1"');
    expect(out).not.toMatch(/<svg[^>]* width=/);
  });
});

describe('IconButton and Tooltip', () => {
  it('names the button and leaves the native title off', () => {
    const out = html(h(IconButton, { label: 'Hide balances', className: 'f-ib', children: h('svg') }));
    expect(out).toBe('<button type="button" aria-label="Hide balances" class="f-ib"><svg></svg></button>');
  });
  it('renders only the trigger until hovered or focused', () => {
    const out = html(h(Tooltip, { label: 'Sync now', children: h('button', { type: 'button' }, 'S') }));
    expect(out).toBe('<button type="button">S</button>');
  });
  it('places the label above, flips below near the top, and stays on screen', () => {
    const win = { width: 400, height: 800 };
    const tip = { width: 100, height: 30 };
    expect(placeTip({ top: 200, bottom: 236, left: 150, width: 36 }, tip, win)).toEqual({ top: 162, left: 118, side: 'top' });
    expect(placeTip({ top: 10, bottom: 46, left: 150, width: 36 }, tip, win)).toEqual({ top: 54, left: 118, side: 'bottom' });
    expect(placeTip({ top: 200, bottom: 236, left: 380, width: 36 }, tip, win).left).toBe(292);
    expect(placeTip({ top: 200, bottom: 236, left: 0, width: 20 }, tip, win).left).toBe(8);
  });
});

describe('other primitives', () => {
  it('InfoTip is a labelled button', () => {
    const out = html(h(InfoTip, { what: 'Gross profit over gross loss.', why: 'Above 1 is profitable.', label: 'Profit factor' }));
    expect(out).toContain('<button');
    expect(out).toMatch(/aria-label="[^"]*Profit factor/);
  });
  it('Freshness renders a dash-free stamp only when it has a time', () => {
    expect(html(h(Freshness, { at: null }))).toBe('');
    expect(html(h(Freshness, { at: Date.now() }))).toContain('Updated');
  });
  it('DateRangePicker starts closed with a Custom button', () => {
    const out = html(h(DateRangePicker, { value: null, onChange: () => {} }));
    expect(out).toContain('aria-expanded="false"');
    expect(out).toContain('Custom');
    expect(out).not.toContain('role="dialog"');
  });
  it('CommandPalette renders pages and actions with combobox wiring', () => {
    const out = html(h(CommandPalette, {
      pages: [{ href: '/dashboard', label: 'Dashboard', group: 'Journal', icon: () => h('svg') }],
      onGo: () => {}, onClose: () => {}, onSignOut: () => {},
    }));
    expect(out).toContain('role="combobox"');
    expect(out).toContain('data-testid="cmdk-group-Pages"');
    expect(out).toContain('data-testid="cmdk-group-Actions"');
    expect(out).toContain('Switch to light theme');
    expect(out).not.toContain('cmdk-group-Recent trades');
  });
});
