import { describe, expect, it } from 'vitest';
import { csvFileName, parseWatchlistCsv, toWatchlistCsv } from './watchlist-csv';

describe('parseWatchlistCsv', () => {
  it('reads one symbol per line under a header', () => {
    expect(parseWatchlistCsv('symbol\nBTCUSDT\nEURUSD\n')).toEqual({ symbols: ['BTCUSDT', 'EURUSD'], skipped: [] });
  });
  it('takes the first column and ignores the rest', () => {
    expect(parseWatchlistCsv('Ticker,Name\nAAPL,Apple\n"BRK.B","Berkshire, B"').symbols).toEqual(['AAPL', 'BRK.B']);
  });
  it('reads a TradingView export on one line', () => {
    const r = parseWatchlistCsv('###Crypto,BINANCE:BTCUSDT,BINANCE:ETHUSDT,###FX,OANDA:EURUSD');
    expect(r).toEqual({ symbols: ['BTCUSDT', 'ETHUSDT', 'EURUSD'], skipped: [] });
  });
  it('keeps case, strips a BOM and handles CRLF', () => {
    expect(parseWatchlistCsv('﻿symbol\r\nEURUSD.m\r\n').symbols).toEqual(['EURUSD.m']);
  });
  it('reports every skipped row with its line and reason', () => {
    const r = parseWatchlistCsv(['symbol', 'BTCUSDT', 'BTC USDT', 'BTCUSDT', 'X'.repeat(33), 'ETHUSDT', 'BINANCE:'].join('\n'), ['ETHUSDT']);
    expect(r.symbols).toEqual(['BTCUSDT']);
    expect(r.skipped).toEqual([
      { line: 3, value: 'BTC USDT', why: 'Has characters a symbol can’t contain' },
      { line: 4, value: 'BTCUSDT', why: 'Repeated in the file' },
      { line: 5, value: 'X'.repeat(33), why: 'Longer than 32 characters' },
      { line: 6, value: 'ETHUSDT', why: 'Already in this list' },
      { line: 7, value: 'BINANCE:', why: 'No symbol after the exchange prefix' },
    ]);
  });
  it('stops at 100 symbols counting the ones already there', () => {
    const existing = Array.from({ length: 98 }, (_, i) => `S${i}`);
    const r = parseWatchlistCsv('A\nB\nC\nD', existing);
    expect(r.symbols).toEqual(['A', 'B']);
    expect(r.skipped.map((s) => s.value)).toEqual(['C', 'D']);
    expect(r.skipped[0]!.why).toMatch(/full/);
  });
  it('ignores blank lines and an empty file', () => {
    expect(parseWatchlistCsv('\n\n')).toEqual({ symbols: [], skipped: [] });
    expect(parseWatchlistCsv('A\n\nB').symbols).toEqual(['A', 'B']);
  });
});

describe('toWatchlistCsv', () => {
  it('round-trips through the parser', () => {
    const syms = ['BTCUSDT', 'EURUSD.m', '^GSPC'];
    expect(parseWatchlistCsv(toWatchlistCsv(syms)).symbols).toEqual(syms);
  });
  it('writes a header and one symbol per row', () => {
    expect(toWatchlistCsv(['A', 'B'])).toBe('symbol\nA\nB\n');
  });
});

describe('csvFileName', () => {
  it('slugs the list name', () => {
    expect(csvFileName('My crypto')).toBe('my-crypto-watchlist.csv');
    expect(csvFileName('Watchlist')).toBe('watchlist.csv');
    expect(csvFileName('★★')).toBe('watchlist.csv');
  });
});
