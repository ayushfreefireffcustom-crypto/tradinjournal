import { describe, it, expect } from 'vitest';
import { normalizeImpact, currencyToCountry, countryToCurrency, toUtc, str } from '../util.js';

describe('normalizeImpact', () => {
  it('maps string labels', () => {
    expect(normalizeImpact('High')).toBe('HIGH');
    expect(normalizeImpact('medium')).toBe('MEDIUM');
    expect(normalizeImpact('Moderate')).toBe('MEDIUM');
    expect(normalizeImpact('Low')).toBe('LOW');
    expect(normalizeImpact('Holiday')).toBe('LOW');
  });
  it('maps numeric levels', () => {
    expect(normalizeImpact(3)).toBe('HIGH');
    expect(normalizeImpact(2)).toBe('MEDIUM');
    expect(normalizeImpact(1)).toBe('LOW');
  });
  it('defaults unknown/empty to LOW', () => {
    expect(normalizeImpact(undefined)).toBe('LOW');
    expect(normalizeImpact('???')).toBe('LOW');
  });
});

describe('toUtc', () => {
  it('treats a tz-less "YYYY-MM-DD HH:MM:SS" as UTC', () => {
    expect(toUtc('2026-08-07 12:30:00').toISOString()).toBe('2026-08-07T12:30:00.000Z');
  });
  it('honours an explicit offset (Forex Factory style)', () => {
    // 08:30 at -04:00 == 12:30 UTC
    expect(toUtc('2026-08-07T08:30:00-04:00').toISOString()).toBe('2026-08-07T12:30:00.000Z');
  });
  it('honours a trailing Z', () => {
    expect(toUtc('2026-08-07T12:30:00Z').toISOString()).toBe('2026-08-07T12:30:00.000Z');
  });
});

describe('currency/country mapping', () => {
  it('round-trips the majors', () => {
    expect(currencyToCountry('USD')).toBe('US');
    expect(currencyToCountry('EUR')).toBe('EU');
    expect(countryToCurrency('US')).toBe('USD');
    expect(countryToCurrency('JP')).toBe('JPY');
  });
  it('degrades gracefully for the unknown', () => {
    expect(currencyToCountry('XYZ')).toBe('XY');
    expect(countryToCurrency('ZZ')).toBe('ZZ');
  });
});

describe('str', () => {
  it('trims, and treats empty / dash as absent', () => {
    expect(str(' 160K ')).toBe('160K');
    expect(str('')).toBeUndefined();
    expect(str('-')).toBeUndefined();
    expect(str(null)).toBeUndefined();
    expect(str(206000)).toBe('206000');
  });
});
