// Forex Factory weekly JSON feed — the closest UX match (authoritative schedule
// + impact fidelity). Its ToS for commercial caching is a grey area, so it is
// isolated behind an explicit opt-in: constructed ONLY when FOREXFACTORY_FEED_URL
// is set. The weekly feed carries forecast/previous but usually not `actual`
// (other providers back-fill that).
//
// The feed's "country" field is actually a CURRENCY code (USD, EUR, …). The feed
// covers the current week regardless of the requested window, so we filter to it.
import type { CalendarProvider, NormalizedEvent } from '../types.js';
import { fetchJson, normalizeImpact, currencyToCountry, str, toUtc } from './util.js';

interface FfRow {
  title: string;
  country: string; // currency code, per the feed
  date: string; // ISO with tz offset
  impact?: string; // High | Medium | Low | Holiday
  forecast?: string;
  previous?: string;
  actual?: string;
}

export function createForexFactoryProvider(feedUrl: string): CalendarProvider {
  return {
    name: 'forexfactory',
    async fetchWindow(fromUtc, toUtc_, signal) {
      let rows: FfRow[];
      try {
        rows = await fetchJson<FfRow[]>(feedUrl, signal);
      } catch {
        return [];
      }
      if (!Array.isArray(rows)) return [];

      const out: NormalizedEvent[] = [];
      for (const r of rows) {
        if (!r?.title || !r?.date || !r?.country) continue;
        const when = toUtc(r.date);
        // The weekly feed can include days outside the requested window — filter.
        if (when < fromUtc || when > toUtc_) continue;
        const currency = r.country.toUpperCase();
        out.push({
          source: 'forexfactory',
          currency,
          country: currencyToCountry(currency),
          title: r.title.trim(),
          impact: normalizeImpact(r.impact),
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
