// Confluence engine (macro segment). PURE math — no I/O. Produces a 0–100 bias
// score per asset from weighted macro factors, with supporting/opposing evidence.
// P0 is a neutral stub; P2 implements the real factor/sensitivity scoring. Every
// output is stamped with ENGINE_VER so scores are reproducible/auditable.

/** Bump on any change to factors, sensitivities, or scoring math. */
export const ENGINE_VER = 'macro-0.0.1';

/** MVP assets. Nifty is deferred (needs an India data source). */
export type MacroAsset = 'BTC' | 'XAU' | 'SPX' | 'DXY';
export const MACRO_ASSETS: readonly MacroAsset[] = ['BTC', 'XAU', 'SPX', 'DXY'] as const;

export type BiasLabel = 'BULLISH' | 'NEUTRAL' | 'BEARISH';

export interface BiasResult {
  asset: MacroAsset;
  score: number; // 0–100
  label: BiasLabel;
  supporting: string[];
  opposing: string[];
}

/**
 * P0 stub — returns a neutral score for every asset. P2 replaces this with the
 * real weighted-factor computation over the macro state.
 */
export function scoreAsset(asset: MacroAsset): BiasResult {
  return { asset, score: 50, label: 'NEUTRAL', supporting: [], opposing: [] };
}
