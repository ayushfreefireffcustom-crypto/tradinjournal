// TradingView economic-calendar provider — the free, no-key source that backs
// TradingView's public embeddable Economic Calendar widget. It returns full
// history AND future scheduled releases with minute-precise times, actual /
// forecast / previous, currency, country and an importance rating — everything
// the paid APIs gate. The endpoint is the widget's own backend, so it needs a
// browser-like Origin header and is an unofficial (widget) API: if TradingView
// ever changes it, fetchWindow simply returns [] and other providers cover.
//
// The window is fetched in day-chunks (not one huge call) so a wide range with
// many countries never blows the per-request timeout or returns a giant payload.
import type { CalendarProvider, NormalizedEvent } from '../types.js';
import type { EventImpact } from '@tradinjournal/contracts';
import { fetchJson, currencyToCountry, str } from './util.js';

const ENDPOINT = 'https://economic-calendar.tradingview.com/events';
// Broad coverage of the economies that move FX / indices / commodities.
const COUNTRIES = 'US,EU,GB,JP,DE,FR,IT,ES,CA,AU,NZ,CH,CN,IN,BR,KR,MX,ZA,SE,NO,SG,HK,RU,TR,PL';
// Fetch in chunks so a wide window stays a set of small, fast calls.
const CHUNK_DAYS = 10;

interface TvEvent {
  title?: string;
  country?: string; // ISO alpha-2 (US, GB) or EU for the euro area
  currency?: string; // USD, EUR, …
  importance?: number; // 1 = high, 0 = medium, -1 = holidays
  date?: string; // ISO UTC, minute-precise
  actual?: number | string | null;
  forecast?: number | string | null;
  previous?: number | string | null;
}

/** TradingView importance (1 = high, 0 = medium, -1 = holidays) → our impact. */
function toImpact(importance: number | undefined): EventImpact {
  if (importance === undefined) return 'MEDIUM';
  if (importance >= 1) return 'HIGH';
  if (importance === 0) return 'MEDIUM';
  return 'LOW'; // holidays / negative
}

async function fetchChunk(from: Date, to: Date, signal?: AbortSignal): Promise<NormalizedEvent[]> {
  const url = `${ENDPOINT}?from=${from.toISOString()}&to=${to.toISOString()}&countries=${COUNTRIES}`;
  let body: { status?: string; result?: TvEvent[] };
  try {
    body = await fetchJson(url, signal, {
      origin: 'https://www.tradingview.com',
      'user-agent': 'Mozilla/5.0 (compatible; TRADElogs/1.0)',
    });
  } catch {
    return [];
  }
  if (body?.status !== 'ok' || !Array.isArray(body.result)) return [];

  const out: NormalizedEvent[] = [];
  for (const r of body.result) {
    if (!r?.title || !r?.date) continue;
    const when = new Date(r.date);
    if (Number.isNaN(when.getTime()) || when < from || when > to) continue;
    const currency = (str(r.currency) ?? '').toUpperCase();
    const country = (str(r.country) ?? '').toUpperCase() || (currency ? currencyToCountry(currency) : '');
    if (!currency && !country) continue;
    out.push({
      source: 'tradingview',
      currency: currency || country,
      country: country || currencyToCountry(currency),
      title: r.title.trim(),
      impact: toImpact(r.importance),
      eventTimeUtc: when,
      actual: str(r.actual),
      forecast: str(r.forecast),
      previous: str(r.previous),
    });
  }
  return out;
}

export function createTradingViewProvider(): CalendarProvider {
  return {
    name: 'tradingview',
    async fetchWindow(fromUtc, toUtc_, signal) {
      // Split [from,to] into day-chunks and fetch them in parallel; one bad chunk
      // never sinks the rest.
      const chunks: Array<[Date, Date]> = [];
      let start = fromUtc.getTime();
      const end = toUtc_.getTime();
      const step = CHUNK_DAYS * 864e5;
      while (start < end) {
        const chunkEnd = Math.min(start + step, end);
        chunks.push([new Date(start), new Date(chunkEnd)]);
        start = chunkEnd;
      }
      const settled = await Promise.allSettled(chunks.map(([a, b]) => fetchChunk(a, b, signal)));
      const out: NormalizedEvent[] = [];
      for (const s of settled) if (s.status === 'fulfilled') out.push(...s.value);
      return out;
    },
  };
}
