// klinecharts draws on canvas, so it can't read CSS variables itself. These
// helpers resolve the v6 tokens from the chart's container and rebuild the
// chart styles, and re-run whenever <html data-theme> flips.
import type { DeepPartial, Styles } from 'klinecharts';

function alpha(color: string, a: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return color;
  const n = parseInt(m[1]!, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

export function chartStyles(el: Element): DeepPartial<Styles> {
  const cs = getComputedStyle(el);
  const v = (name: string, fallback = '') => cs.getPropertyValue(name).trim() || fallback;
  const g = v('--g');
  const r = v('--r');
  const tx = v('--tx');
  const mut = v('--mut');
  const dim = v('--dim');
  const grid = v('--grid');
  const axis = v('--axis');
  const line = v('--line');
  const hi = v('--hi');
  const inv = v('--inv');
  const onG = v('--on-g');
  const mono = v('--mono', '"JetBrains Mono", ui-monospace, monospace');
  const sans = v('--sans', 'Satoshi, ui-sans-serif, system-ui, sans-serif');

  const tick = { color: axis, size: 11, family: mono, weight: '400' };
  const xhairText = { backgroundColor: hi, borderColor: hi, color: inv, family: mono, size: 11, weight: '400' };
  const lineStyle = (color: string) => ({ style: 'solid' as const, smooth: false, size: 1, dashedValue: [2, 2], color });
  const barStyle = { style: 'fill' as const, borderStyle: 'solid' as const, borderSize: 1, borderDashedValue: [2, 2], upColor: alpha(g, 0.55), downColor: alpha(r, 0.55), noChangeColor: dim };

  return {
    grid: { horizontal: { color: grid, style: 'solid' }, vertical: { show: false } },
    candle: {
      bar: {
        upColor: g, downColor: r, noChangeColor: dim,
        upBorderColor: g, downBorderColor: r, noChangeBorderColor: dim,
        upWickColor: g, downWickColor: r, noChangeWickColor: dim,
      },
      priceMark: {
        high: { color: mut, textFamily: mono }, low: { color: mut, textFamily: mono },
        last: { upColor: g, downColor: r, noChangeColor: dim, line: { style: 'dashed', dashedValue: [4, 4] }, text: { color: onG, family: mono } },
      },
      // OHLC legend only while the crosshair is active; the pane header shows price.
      tooltip: { showRule: 'follow_cross', showType: 'standard', title: { show: false }, legend: { color: mut, family: mono } },
    },
    indicator: {
      ohlc: { upColor: g, downColor: r, noChangeColor: dim },
      bars: [barStyle],
      lines: [lineStyle(tx), lineStyle(g), lineStyle(r), lineStyle(mut), lineStyle(dim)],
      circles: [{ ...barStyle, upColor: alpha(g, 0.55), downColor: alpha(r, 0.55) }],
      lastValueMark: { show: false },
      tooltip: { showRule: 'follow_cross', legend: { color: mut, family: mono }, title: { color: mut, family: sans } },
    },
    xAxis: { axisLine: { color: line }, tickLine: { color: line }, tickText: tick },
    yAxis: { axisLine: { color: line }, tickLine: { color: line }, tickText: tick },
    separator: { color: line, activeBackgroundColor: alpha(g, 0.12) },
    crosshair: {
      horizontal: { line: { color: dim }, text: xhairText },
      vertical: { line: { color: dim }, text: xhairText },
    },
    overlay: {
      point: { color: g, borderColor: alpha(g, 0.35), activeColor: g, activeBorderColor: alpha(g, 0.35) },
      line: { color: tx },
      rect: { color: alpha(g, 0.1), borderColor: g },
      polygon: { color: alpha(g, 0.1), borderColor: g },
      circle: { color: alpha(g, 0.1), borderColor: g },
      arc: { color: g },
      text: { color: onG, backgroundColor: g, borderColor: g, family: mono },
    },
  };
}

/** Calls `fn` whenever the theme attribute on <html> changes. Returns a disposer. */
export function onThemeChange(fn: () => void): () => void {
  if (typeof MutationObserver === 'undefined') return () => {};
  const mo = new MutationObserver(fn);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => mo.disconnect();
}
