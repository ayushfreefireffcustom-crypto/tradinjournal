// Financial Modeling Prep economic calendar. Free keyed tier; clean JSON with
// full actual/forecast/previous numbers — our primary "numbers" source and a
// fallback schedule. Constructed only when FMP_API_KEY is set.
import type { CalendarProvider, NormalizedEvent } from '../types.js';
import { fetchJson, normalizeImpact, currencyToCountry, str, toUtc } from './util.js';

interface FmpRow {
  date: string; // "YYYY-MM-DD HH:MM:SS" (UTC)
  country?: string; // ISO2 or name
  event: string;
  currency?: string;
  previous?: number | string | null;
  estimate?: number | string | null;
  actual?: number | string | null;
  impact?: string;
  unit?: string;
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);

export function createFmpProvider(apiKey: string): CalendarProvider {
  return {
    name: 'fmp',
    async fetchWindow(fromUtc, toUtc_, signal) {
      const url =
        `https://financialmodelingprep.com/api/v3/economic_calendar` +
        `?from=${ymd(fromUtc)}&to=${ymd(toUtc_)}&apikey=${encodeURIComponent(apiKey)}`;
      let rows: FmpRow[];
      try {
        rows = await fetchJson<FmpRow[]>(url, signal);
      } catch {
        return []; // never throw for "no data"
      }
      if (!Array.isArray(rows)) return [];

      const out: NormalizedEvent[] = [];
      for (const r of rows) {
        if (!r?.event || !r?.date) continue;
        const currency = (str(r.currency) ?? str(r.country) ?? '').toUpperCase();
        if (!currency) continue;
        out.push({
          source: 'fmp',
          currency,
          country: currencyToCountry(currency),
          title: r.event.trim(),
          impact: normalizeImpact(r.impact),
          eventTimeUtc: toUtc(r.date),
          actual: str(r.actual),
          forecast: str(r.estimate),
          previous: str(r.previous),
          unit: str(r.unit),
        });
      }
      return out;
    },
  };
}
