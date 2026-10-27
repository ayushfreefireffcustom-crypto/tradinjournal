// Cached AI performance narrative for one account.
//
// Generating a review costs a model call, and a trader opening the dashboard five
// times in an hour has not changed their data. So the narrative is keyed on a hash
// of the TraderContext it was written from: same hash, same answer, no tokens. A
// new closed trade (or an edited journal entry) moves the hash and the next read
// regenerates. One row per account, upserted, so the table stays bounded.
//
// Never throws for AI reasons: no key, provider down, or empty output all degrade
// to the deterministic rule-based summary — the dashboard always renders.
import { prisma } from '@tradinjournal/db';
import { logger } from '@tradinjournal/logger';
import type { TraderContext } from '@tradinjournal/core';
import { isAiEnabled, getProvider } from '../../lib/ai/provider.js';
import { loadTraderContext } from '../../lib/ai/context.js';
import { hashContext } from '../../lib/ai/report-hash.js';
import { REPORT_PROMPT, contextMessageContent } from '../../lib/ai/prompts.js';

export interface AiReportResult {
  content: string;
  /** The stored narrative was reused — no model call was made. */
  cached: boolean;
  /** False when this is the rule-based fallback rather than a written review. */
  generated: boolean;
  /** Cached text served after a failed regeneration (data has since moved on). */
  stale: boolean;
  /** ISO timestamp the served narrative was written. */
  updatedAt: string;
  model?: string;
}

/** Minimum closed trades before a narrative is worth generating. */
const MIN_TRADES = 3;

/** Deterministic stand-in used whenever the model can't be reached. */
function fallbackReport(ctx: TraderContext): string {
  if (ctx.insights.length === 0) {
    return "**Overview**\n\nNot enough closed trades yet to review. Keep logging — once there's a track record here, this turns into a real breakdown of what's working and what isn't.";
  }
  return `**Overview**\n\nThe written review isn't available right now, but your data already shows this:\n\n${ctx.insights
    .map(i => `- ${i}`)
    .join('\n')}`;
}

function fromRow(
  row: { content: string; model: string | null; updatedAt: Date },
  opts: { cached: boolean; stale: boolean },
): AiReportResult {
  return {
    content: row.content,
    cached: opts.cached,
    generated: true,
    stale: opts.stale,
    updatedAt: row.updatedAt.toISOString(),
    model: row.model ?? undefined,
  };
}

/**
 * Return the account's narrative, generating one only when the underlying data
 * has changed since the cached copy was written (or when `force` is set).
 */
export async function getReport(
  userId: string,
  accountId: string,
  opts: { force?: boolean } = {},
): Promise<AiReportResult> {
  const context = await loadTraderContext(userId, accountId);
  const dataHash = hashContext(context);
  const key = { userId_brokerAccountId: { userId, brokerAccountId: accountId } };

  const existing = await prisma.aiReport.findUnique({ where: key });
  if (existing && existing.dataHash === dataHash && !opts.force) {
    return fromRow(existing, { cached: true, stale: false });
  }

  const unwritten = (content: string): AiReportResult => ({
    content,
    cached: false,
    generated: false,
    stale: false,
    updatedAt: new Date().toISOString(),
  });

  // Too thin to be worth a model call, and too thin to say anything useful.
  if (context.summary.totalTrades < MIN_TRADES) return unwritten(fallbackReport(context));
  if (!isAiEnabled()) return unwritten(fallbackReport(context));

  let content: string;
  try {
    const provider = getProvider();
    content = (
      await provider.complete([
        { role: 'system', content: REPORT_PROMPT },
        { role: 'system', content: contextMessageContent(context) },
        { role: 'user', content: 'Write my performance review.' },
      ], { effort: 'medium', maxTokens: 6000 })
    ).trim();

    if (!content) throw new Error('Model returned an empty review');

    const saved = await prisma.aiReport.upsert({
      where: key,
      create: { userId, brokerAccountId: accountId, dataHash, content, model: provider.model },
      update: { dataHash, content, model: provider.model },
    });
    return fromRow(saved, { cached: false, stale: false });
  } catch (err) {
    logger.warn(`AI report generation failed: ${(err as Error).message}`);
    // A slightly out-of-date review still beats no review.
    if (existing) return fromRow(existing, { cached: true, stale: true });
    return unwritten(fallbackReport(context));
  }
}
