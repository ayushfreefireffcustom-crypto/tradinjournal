import { describe, it, expect } from 'vitest';
import { parseAnalysisJson } from '../trader.prompt.js';

describe('parseAnalysisJson', () => {
  it('parses a bare JSON object', () => {
    const r = parseAnalysisJson('{"direction":"LONG","confidence":70,"rationale":"ok"}');
    expect(r?.direction).toBe('LONG');
    expect(r?.confidence).toBe(70);
  });

  it('parses JSON inside a ```json fenced block', () => {
    const raw = 'Here you go:\n```json\n{"direction":"SHORT","stop":101.2}\n```\nthanks';
    const r = parseAnalysisJson(raw);
    expect(r?.direction).toBe('SHORT');
    expect(r?.stop).toBe(101.2);
  });

  it('extracts the object when wrapped in prose', () => {
    const r = parseAnalysisJson('The analysis is {"direction":"WAIT"} — hope that helps');
    expect(r?.direction).toBe('WAIT');
  });

  it('returns null for non-JSON text', () => {
    expect(parseAnalysisJson('I cannot help with that')).toBeNull();
  });

  it('returns null for malformed JSON', () => {
    expect(parseAnalysisJson('{"direction": LONG, bad}')).toBeNull();
  });

  it('drops fields that fail the schema (bad direction) but keeps the rest', () => {
    const r = parseAnalysisJson('{"direction":"UPWARD","confidence":50}');
    // "UPWARD" is not a valid enum → whole parse fails safe to null.
    expect(r).toBeNull();
  });

  it('returns null on empty / non-string input', () => {
    expect(parseAnalysisJson('')).toBeNull();
    // @ts-expect-error testing runtime guard
    expect(parseAnalysisJson(null)).toBeNull();
  });
});
