// Cache key for the AI performance narrative: a fingerprint of the TraderContext
// the review was written from. Identical data must always produce an identical
// hash (so a repeat dashboard load is free), and any change to the trader's
// numbers must produce a different one (so the review never goes stale silently).
import { createHash } from 'node:crypto';
import type { TraderContext } from '@tradinjournal/core';

/**
 * Canonical JSON: keys sorted at every level, so two structurally identical
 * contexts hash the same regardless of the order their properties were built in.
 */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    const src = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(src).sort()) out[key] = canonical(src[key]);
    return out;
  }
  return value;
}

export function hashContext(ctx: TraderContext): string {
  return createHash('sha256').update(JSON.stringify(canonical(ctx))).digest('hex');
}
