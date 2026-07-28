// TradingView economic-calendar provider — the free, no-key source that backs
// TradingView's public embeddable Economic Calendar widget. It returns full
// history AND future scheduled releases with minute-precise times, actual /
// forecast / previous, currency, country and an importance rating — everything
// the paid APIs gate. The endpoint is the widget's own backend, so it needs a
// browser-like Origin header and is an unofficial (widget) API: if TradingView
// ever changes it, fetchWindow simply returns [] and other providers cover.
import type { CalendarProvider, NormalizedEvent } from '../types.js';
import type { EventImpact } from '@tradinjournal/contracts';
import { fetchJson, currencyToCountry, str } from './util.js';

const ENDPOINT = 'https://economic-calendar.tradingview.com/events';
// Major economies whose releases move FX / indices / commodities. Kept tight so
// the feed stays a tradeable economic calendar, not a global holiday list.
const COUNTRIES = 'US,EU,GB,JP,DE,CA,AU,NZ,CH,CN';

interface TvEvent {
  id?: string;
  title?: string;
  country?: string; // ISO alpha-2 (US, GB) or EU for the euro area
  currency?: string; // USD, EUR, …
  importance?: number; // 1 = high, 0 = medium, -1 = holidays / low
  date?: string; // ISO UTC, minute-precise
  actual?: number | string | null;
  forecast?: number | string | null;
  previous?: number | string | null;
}

/** TradingView importance (1 = high, 0 = medium; -1 = holidays, dropped). */
function toImpact(importance: number | undefined): EventImpact {
  return importance !== undefined && importance >= 1 ? 'HIGH' : 'MEDIUM';
}

export function createTradingViewProvider(): CalendarProvider {
  return {
    name: 'tradingview',
    async fetchWindow(fromUtc, toUtc_, signal) {
      const url = `${ENDPOINT}?from=${fromUtc.toISOString()}&to=${toUtc_.toISOString()}&countries=${COUNTRIES}`;
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
        if (typeof r.importance === 'number' && r.importance < 0) continue; // holidays
        const when = new Date(r.date);
        if (Number.isNaN(when.getTime()) || when < fromUtc || when > toUtc_) continue;
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
    },
  };
}
