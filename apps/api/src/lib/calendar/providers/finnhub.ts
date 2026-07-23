// Finnhub economic calendar. Free keyed tier (US-centric); a cross-check / fill
// source. Gives ISO-3166 country but not currency, so we derive currency from
// country. Constructed only when FINNHUB_API_KEY is set.
import type { CalendarProvider, NormalizedEvent } from '../types.js';
import { fetchJson, normalizeImpact, countryToCurrency, str, toUtc } from './util.js';

interface FinnhubRow {
  time: string; // "YYYY-MM-DD HH:MM:SS" (UTC)
  country?: string; // ISO2
  event: string;
  impact?: string | number;
  actual?: number | string | null;
  estimate?: number | string | null;
  prev?: number | string | null;
  unit?: string;
}
interface FinnhubResponse {
  economicCalendar?: FinnhubRow[];
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);

export function createFinnhubProvider(apiKey: string): CalendarProvider {
  return {
    name: 'finnhub',
    async fetchWindow(fromUtc, toUtc_, signal) {
      const url =
        `https://finnhub.io/api/v1/calendar/economic` +
        `?from=${ymd(fromUtc)}&to=${ymd(toUtc_)}&token=${encodeURIComponent(apiKey)}`;
      let json: FinnhubResponse;
      try {
        json = await fetchJson<FinnhubResponse>(url, signal);
      } catch {
        return [];
      }
      const rows = json?.economicCalendar;
      if (!Array.isArray(rows)) return [];

      const out: NormalizedEvent[] = [];
      for (const r of rows) {
        if (!r?.event || !r?.time) continue;
        const country = (str(r.country) ?? 'US').toUpperCase();
        out.push({
          source: 'finnhub',
          country,
          currency: countryToCurrency(country),
          title: r.event.trim(),
          impact: normalizeImpact(r.impact),
          eventTimeUtc: toUtc(r.time),
          actual: str(r.actual),
          forecast: str(r.estimate),
          previous: str(r.prev),
          unit: str(r.unit),
        });
      }
      return out;
    },
  };
}
