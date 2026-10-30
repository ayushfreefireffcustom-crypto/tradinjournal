// klinecharts draws on canvas, so it can't read CSS variables itself. These
// helpers resolve the v6 tokens from the chart's container and rebuild the
// chart styles, and re-run whenever <html data-theme> flips.
import type { AxisCreateTicksParams, AxisTick, Chart, DeepPartial, FormatDateParams, Styles } from 'klinecharts';

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

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Calendar parts of a timestamp in the formatter's timezone. */
function parts(fmt: Intl.DateTimeFormat, ts: number) {
  const p: Record<string, string> = {};
  for (const x of fmt.formatToParts(ts)) p[x.type] = x.value;
  return { y: p.year ?? '', m: Number(p.month) - 1, d: Number(p.day), hm: `${p.hour === '24' ? '00' : p.hour}:${p.minute}` };
}

/** Crosshair and tooltip dates in the app's style: "Oct 30, 2026 04:30". */
export function chartDate({ dateTimeFormat, timestamp, template }: FormatDateParams): string {
  const t = parts(dateTimeFormat, timestamp);
  if (template === 'YYYY') return t.y;
  if (template === 'YYYY-MM') return `${MON[t.m]} ${t.y}`;
  if (template === 'HH:mm' || template === 'HH:mm:ss') return t.hm;
  const day = `${MON[t.m]} ${t.d}, ${t.y}`;
  return template.includes('HH') ? `${day} ${t.hm}` : day;
}

/**
 * X-axis ticks: the date where a day (or month, or year) starts and the time in
 * between, and none so close to an edge that the canvas would cut it off.
 */
export function chartXTicks(chart: Chart) {
  return ({ defaultTicks, bounding }: AxisCreateTicksParams): AxisTick[] => {
    const fmt = new Intl.DateTimeFormat('en', {
      timeZone: chart.getTimezone() || undefined, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    });
    const type = chart.getPeriod()?.type ?? 'day';
    const edge = 24;
    let prev: ReturnType<typeof parts> | null = null;
    const out: AxisTick[] = [];
    for (const tick of defaultTicks) {
      if (tick.coord < edge || tick.coord > bounding.width - edge) continue;
      const t = parts(fmt, Number(tick.value));
      const newDay = !prev || prev.d !== t.d || prev.m !== t.m;
      const newYear = !!prev && prev.y !== t.y;
      const text = type === 'year' ? t.y
        : type === 'month' ? (newYear || !prev ? t.y : MON[t.m]!)
        : type === 'day' || type === 'week' ? (newYear ? t.y : `${MON[t.m]} ${t.d}`)
        : newDay ? `${MON[t.m]} ${t.d}` : t.hm;
      out.push({ ...tick, text });
      prev = t;
    }
    return out;
  };
}
