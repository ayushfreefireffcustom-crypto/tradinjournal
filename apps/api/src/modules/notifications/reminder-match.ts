// Which calendar events a user gets reminded about (in-app/push and the email
// digest). Watched events always count. Otherwise an event must pass the
// impact floor, the user's currencies and categories, and must not be a
// market holiday.
//
// An empty currency list used to mean "every currency", which sent every user
// reminders for INR, BRL, RUB and so on. It now means "my currencies": the
// currencies in the symbols the user traded in the last 90 days, plus USD.
import { prisma, Prisma } from '@tradinjournal/db';
import type { EventImpact } from '@tradinjournal/contracts';

const RANK: Record<EventImpact, number> = { LOW: 0, MEDIUM: 1, HIGH: 2 };
const TRADED_LOOKBACK_DAYS = 90;

/** Always relevant: most markets move on US data. */
export const BASE_CURRENCY = 'USD';

const ISO = new Set([
  'USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD', 'CNY', 'CNH', 'HKD', 'SGD', 'SEK', 'NOK', 'DKK',
  'PLN', 'HUF', 'CZK', 'TRY', 'ZAR', 'MXN', 'BRL', 'INR', 'KRW', 'RUB', 'ILS', 'THB',
]);

// Index and commodity CFDs → the currency whose data moves them.
const NAMED: Array<[RegExp, string]> = [
  [/^(US30|US500|US100|US2000|SPX|SP500|NAS|NDX|USTEC|DJ|DOW|WS30|RUSSELL|USOIL|WTI|UKOIL|BRENT|XNG|NATGAS)/, 'USD'],
  [/^(GER|DE30|DE40|DAX|EU50|EUSTX|STOXX|FRA40|FR40|CAC|ESP35|SPA35|IT40|NETH25)/, 'EUR'],
  [/^(UK100|FTSE)/, 'GBP'],
  [/^(JP225|JPN225|NIKKEI|NI225)/, 'JPY'],
  [/^(AUS200|ASX)/, 'AUD'],
  [/^(HK50|HSI|HK33)/, 'HKD'],
  [/^(CHINA50|CN50|CHINAH|A50)/, 'CNY'],
  [/^(SWI20|SMI)/, 'CHF'],
  [/^(CAN60|TSX)/, 'CAD'],
  [/^(NIFTY|SENSEX|IND50)/, 'INR'],
];

/** "EURUSD.m" → [EUR, USD]; "XAUUSD" → [USD]; "GER40" → [EUR]; unknown → []. */
export function symbolCurrencies(symbol: string): string[] {
  const s = symbol.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const named = NAMED.find(([re]) => re.test(s));
  if (named) return [named[1]];
  const out = new Set<string>();
  for (const code of [s.slice(0, 3), s.slice(3, 6)]) {
    if (ISO.has(code)) out.add(code === 'CNH' ? 'CNY' : code);
  }
  return [...out];
}

interface EventLike {
  title: string;
  currency: string;
  category: string | null;
  impact: EventImpact;
  eventTime: Date;
  actual?: string | null;
  forecast?: string | null;
  previous?: string | null;
}

/**
 * Bank and market holidays arrive as low-impact rows with no numbers, usually
 * at 00:00 UTC ("Proclamation of the Republic Day", "Labor Day").
 */
export function isHolidayEvent(e: EventLike): boolean {
  if (e.impact !== 'LOW') return false;
  if (e.actual || e.forecast || e.previous) return false;
  const midnight = e.eventTime.getUTCHours() === 0 && e.eventTime.getUTCMinutes() === 0;
  return midnight || /\b(day|holiday|festival|new year|christmas|easter|eid|diwali|thanksgiving)\b/i.test(e.title);
}

export interface MatchPrefs {
  minImpact: EventImpact;
  currencies: string[];
  categories: string[];
}

/** An unwatched event the user's preferences ask for. */
export function matchesPrefs(e: EventLike, p: MatchPrefs, myCurrencies: ReadonlySet<string>): boolean {
  if (isHolidayEvent(e)) return false;
  if (RANK[e.impact] < RANK[p.minImpact]) return false;
  const curOk = p.currencies.length ? p.currencies.includes(e.currency) : myCurrencies.has(e.currency);
  if (!curOk) return false;
  return p.categories.length === 0 || (e.category ? p.categories.includes(e.category) : true);
}

/** Each user's currencies: from symbols traded in the last 90 days, plus USD. */
export async function currenciesByUser(userIds: string[], now = new Date()): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>(userIds.map(id => [id, new Set([BASE_CURRENCY])]));
  if (userIds.length === 0) return out;
  const since = new Date(now.getTime() - TRADED_LOOKBACK_DAYS * 86_400_000);
  const rows = await prisma.$queryRaw<{ userId: string; symbol: string }[]>`
    SELECT DISTINCT b."userId", e.symbol
    FROM "execution" e
    JOIN "broker_account" b ON b.id = e."brokerAccountId"
    WHERE b."userId" IN (${Prisma.join(userIds)})
      AND e.type IN ('BUY', 'SELL')
      AND e."dealTime" >= ${since}`;
  for (const r of rows) {
    const set = out.get(r.userId);
    if (set) for (const c of symbolCurrencies(r.symbol)) set.add(c);
  }
  return out;
}
