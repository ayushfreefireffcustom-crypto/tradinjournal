// Builds the active set of calendar providers from config. Only providers whose
// prerequisites (key / feed URL) are present are constructed, so a provider is
// never live without its credentials. Returns [] when nothing is configured —
// callers treat that as "calendar disabled".
import { env } from '@tradinjournal/config';
import type { CalendarProvider } from '../types.js';
import { createTradingViewProvider } from './tradingview.js';
import { createFmpProvider } from './fmp.js';
import { createFinnhubProvider } from './finnhub.js';
import { createForexFactoryProvider } from './forexfactory.js';

let cached: CalendarProvider[] | null = null;

export function getCalendarProviders(): CalendarProvider[] {
  if (cached) return cached;
  const providers: CalendarProvider[] = [];
  // TradingView needs no key and covers full history + forecasts, so it's the
  // always-on baseline (unless explicitly disabled). Keyed providers still add
  // provenance / back-fill when configured.
  if (env.TRADINGVIEW_CALENDAR_ENABLED) providers.push(createTradingViewProvider());
  if (env.FOREXFACTORY_FEED_URL) providers.push(createForexFactoryProvider(env.FOREXFACTORY_FEED_URL));
  if (env.FMP_API_KEY) providers.push(createFmpProvider(env.FMP_API_KEY));
  if (env.FINNHUB_API_KEY) providers.push(createFinnhubProvider(env.FINNHUB_API_KEY));
  cached = providers;
  return providers;
}
