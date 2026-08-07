// Map persisted macro DTOs → pure EngineInput (no I/O).
import type { EngineInput } from '@tradinjournal/core';

/** Build pure-engine input from indicator/quote DTOs. */
export function toEngineInput(
  macro: { key: string; value: number; prev?: number | null }[],
  markets: { symbol: string; price: number; changePct?: number | null }[],
): EngineInput {
  return {
    indicators: macro.map(m => ({
      key: m.key,
      value: m.value,
      prev: m.prev ?? null,
    })),
    markets: markets.map(m => ({
      symbol: m.symbol,
      price: m.price,
      changePct: m.changePct ?? null,
    })),
  };
}
