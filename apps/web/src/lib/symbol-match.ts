// Lightweight, dependency-free symbol tagging for the news feed. Scans a
// headline/summary for mentions of tradeable instruments and returns their
// canonical symbols, so items can be flagged "YOUR MARKET" against the symbols a
// user actually trades. Pure + unit-tested in symbol-match.test.ts.
//
// This is the MVP: a curated alias dictionary matched with word boundaries.
// A later pass can move tagging server-side (LLM) for macro/indirect relevance.

/**
 * Canonical symbol → the phrases that imply it. Lowercase; matched \b-bounded.
 * Aliases double as broker-name synonyms (e.g. "gold" ⇒ XAUUSD), so a broker
 * symbol like GOLD canonicalizes to the same key news is tagged with.
 */
export const SYMBOL_ALIASES: Record<string, string[]> = {
  BTCUSD: ['bitcoin', 'btc', 'btcusd', 'btcusdt', 'xbt'],
  ETHUSD: ['ethereum', 'ether', 'eth', 'ethusd'],
  XAUUSD: ['gold', 'xau', 'xauusd'],
  XAGUSD: ['silver', 'xag', 'xagusd'],
  EURUSD: ['euro', 'eurusd', 'eur/usd'],
  GBPUSD: ['sterling', 'cable', 'pound', 'gbpusd', 'gbp/usd'],
  USDJPY: ['yen', 'usdjpy', 'usd/jpy'],
  USDCHF: ['swiss franc', 'franc', 'swissie', 'usdchf'],
  USDCAD: ['canadian dollar', 'loonie', 'usdcad'],
  AUDUSD: ['aussie', 'australian dollar', 'audusd'],
  NZDUSD: ['kiwi', 'new zealand dollar', 'nzdusd'],
  US500: ['s&p 500', 's&p500', 'sp500', 'sp 500', 'us500', 'spx500', 'spx', 's&p'],
  US30: ['dow jones', 'dow', 'us30', 'djia'],
  US100: ['nasdaq 100', 'nasdaq', 'us100', 'nas100', 'ndx'],
  WTIUSD: ['crude oil', 'crude', 'wti', 'usoil', 'wtiusd', 'oil'],
};

// alias/canonical (lowercased) → canonical symbol, for reverse lookup.
const ALIAS_TO_CANONICAL = new Map<string, string>();
for (const [canon, aliases] of Object.entries(SYMBOL_ALIASES)) {
  ALIAS_TO_CANONICAL.set(canon.toLowerCase(), canon);
  for (const a of aliases) ALIAS_TO_CANONICAL.set(a.toLowerCase(), canon);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// One case-insensitive, word-bounded regex per symbol (compiled once).
const COMPILED: { symbol: string; re: RegExp }[] = Object.entries(SYMBOL_ALIASES).map(([symbol, aliases]) => ({
  symbol,
  re: new RegExp(`\\b(?:${aliases.map(escapeRegex).join('|')})\\b`, 'i'),
}));

/** Canonical symbols mentioned in `text` (deduped; empty for no match). */
export function matchSymbols(text: string): string[] {
  if (!text) return [];
  const out: string[] = [];
  for (const { symbol, re } of COMPILED) if (re.test(text)) out.push(symbol);
  return out;
}

/**
 * Reduce a raw broker symbol to a canonical form for comparison — drops the
 * suffix brokers append (XAUUSD.m, EURUSD.pro, US500.cash) and any punctuation.
 */
export function normalizeSymbol(raw: string): string {
  return (raw || '').toUpperCase().split('.')[0]!.replace(/[^A-Z0-9]/g, '');
}

/**
 * Map any broker symbol / alias to the canonical key the news matcher emits, so
 * both sides intersect. GOLD → XAUUSD, SPX500 → US500, EURUSD → EURUSD. Unknown
 * symbols pass through normalized (still comparable to themselves).
 */
export function canonicalize(raw: string): string {
  const n = normalizeSymbol(raw);
  return ALIAS_TO_CANONICAL.get(n.toLowerCase()) ?? n;
}

/** Symbols in `text` that are also in the user's (normalized) traded set. */
export function matchesUserSymbols(text: string, userSymbols: ReadonlySet<string>): string[] {
  if (userSymbols.size === 0) return [];
  return matchSymbols(text).filter(s => userSymbols.has(s));
}
