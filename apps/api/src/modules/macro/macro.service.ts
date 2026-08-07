// Macro segment service. P0 is a skeleton: getMacroState returns an empty
// placeholder (no snapshots ingested yet) and ingestMacro is a no-op. P1 fills
// these — FRED + market snapshots → PG, engine → BiasScore, cached state JSON.
import { ENGINE_VER } from '@tradinjournal/core';
import type { MacroState, MacroIngestInput } from '@tradinjournal/contracts';
import { logger } from '@tradinjournal/logger';

/**
 * The single dashboard JSON the terminal + assistant consume. P0: empty shape
 * (no data yet) so the UI and contract are wired before the data spine lands.
 */
export async function getMacroState(): Promise<MacroState> {
  return {
    asOf: new Date().toISOString(),
    regime: null,
    macro: [],
    markets: [],
    bias: [],
    events: [],
    headlines: [],
    engineVer: ENGINE_VER,
  };
}

/** P0 no-op. P1: pull FRED + markets, upsert snapshots, run engine, cache state. */
export async function ingestMacro(input: MacroIngestInput): Promise<{ ingested: number }> {
  logger.info('[macro] ingest stub (no-op — P1 fills)', { reason: input.reason });
  return { ingested: 0 };
}
