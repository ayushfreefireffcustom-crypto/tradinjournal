// Economic-calendar provider abstraction, mirroring lib/ai/search.ts: callers
// depend only on the CalendarProvider interface, never on a concrete backend.
// Providers are free-first and swappable; several can contribute to one event
// (the reconciler merges them field-by-field with provenance).
//
// All times are UTC. Result numbers (actual/forecast/previous) stay STRINGS so
// units and signs ("%", "K", "-0.2") survive intact — never coerce to number.

export type EventImpact = 'LOW' | 'MEDIUM' | 'HIGH';

/** One event as a single provider reports it, already normalized to our vocab. */
export interface NormalizedEvent {
  /** Provider name, e.g. "forexfactory" | "fmp" | "finnhub". */
  source: string;
  /** ISO-3166 alpha-2 country (for the flag). */
  country: string;
  /** Currency code, e.g. USD, EUR. */
  currency: string;
  title: string;
  impact: EventImpact;
  category?: string;
  /** Event time in UTC. */
  eventTimeUtc: Date;
  actual?: string;
  forecast?: string;
  previous?: string;
  unit?: string;
}

export interface CalendarProvider {
  readonly name: string;
  /**
   * Fetch all events in [fromUtc, toUtc]. Never throws for "no data" — returns
   * []. Honours the abort signal and an internal hard timeout. A provider that
   * is misconfigured (missing key) should not be constructed at all.
   */
  fetchWindow(fromUtc: Date, toUtc: Date, signal?: AbortSignal): Promise<NormalizedEvent[]>;
}
