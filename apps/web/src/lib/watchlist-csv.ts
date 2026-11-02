// Watchlist CSV import/export (QW.13). Import takes the first column of each row
// (a "symbol" header is fine), a TradingView watchlist export (comma-separated
// EXCHANGE:SYMBOL, "###Section" headers) or one symbol per line, and reports
// every row it skipped and why. Export is one symbol per row under a header.
/** Same cap as the API (WATCHLIST_MAX_SYMBOLS in @tradinjournal/contracts). */
export const WATCHLIST_MAX_SYMBOLS = 100;
/** Same cap as the API (WATCHLIST_MAX_LISTS). */
export const WATCHLIST_MAX_LISTS = 8;

export interface SkippedRow { line: number; value: string; why: string }
export interface CsvImport { symbols: string[]; skipped: SkippedRow[] }

const OK = /^[A-Za-z0-9._\-^=!/]+$/;
const HEADER = /^(symbol|symbols|ticker|tickers|instrument)$/i;

/** Splits one CSV line, honouring double quotes. */
function cells(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') quoted = false; else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ',' || c === ';' || c === '\t') { out.push(cur); cur = ''; } else cur += c;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

/**
 * Parse an uploaded file. `existing` are the symbols already in the list: they
 * count towards the 100 limit and repeats of them are reported, not added.
 */
export function parseWatchlistCsv(text: string, existing: readonly string[] = []): CsvImport {
  const have = new Set(existing);
  const symbols: string[] = [];
  const skipped: SkippedRow[] = [];
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  // A one-line file with several cells is a TradingView-style list; otherwise the first column.
  const oneLine = lines.filter((l) => l.trim()).length === 1;
  lines.forEach((raw, i) => {
    const line = i + 1;
    if (!raw.trim()) return;
    const values = oneLine ? cells(raw) : [cells(raw)[0] ?? ''];
    for (const v0 of values) {
      if (!v0) continue;
      if (v0.startsWith('###')) continue; // TradingView section header
      if (line === 1 && HEADER.test(v0)) continue;
      const v = v0.includes(':') ? v0.slice(v0.lastIndexOf(':') + 1) : v0; // BINANCE:BTCUSDT → BTCUSDT
      if (!v) { skipped.push({ line, value: v0, why: 'No symbol after the exchange prefix' }); continue; }
      if (v.length > 32) { skipped.push({ line, value: v0, why: 'Longer than 32 characters' }); continue; }
      if (!OK.test(v)) { skipped.push({ line, value: v0, why: 'Has characters a symbol can’t contain' }); continue; }
      if (have.has(v)) { skipped.push({ line, value: v0, why: existing.includes(v) ? 'Already in this list' : 'Repeated in the file' }); continue; }
      if (have.size >= WATCHLIST_MAX_SYMBOLS) { skipped.push({ line, value: v0, why: `The list is full (${WATCHLIST_MAX_SYMBOLS} symbols)` }); continue; }
      have.add(v);
      symbols.push(v);
    }
  });
  return { symbols, skipped };
}

const quote = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

export function toWatchlistCsv(symbols: readonly string[]): string {
  return ['symbol', ...symbols.map(quote)].join('\n') + '\n';
}

/** A safe file name for a list: "My crypto" → "my-crypto-watchlist.csv". */
export function csvFileName(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const base = slug || 'watchlist';
  return `${base}${base.endsWith('watchlist') ? '' : '-watchlist'}.csv`;
}
