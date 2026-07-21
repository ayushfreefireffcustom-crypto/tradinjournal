// Loads a trader's grounding context for the AI coach by reusing the exact same
// server-side data the dashboard already computes (fetchStats / fetchTrades) plus
// their journal, then folding it into the compact TraderContext card from core.
import { buildTraderContext, type TraderContext } from '@tradinjournal/core';
import { fetchStats, fetchTrades } from '../../modules/trades/trades.service.js';
import { listJournalEntries } from '../../modules/journal/journal.service.js';

export async function loadTraderContext(userId: string, accountId: string): Promise<TraderContext> {
  const [stats, trades, journal] = await Promise.all([
    fetchStats(userId, accountId),
    fetchTrades(userId, accountId),
    listJournalEntries(userId, accountId),
  ]);
  return buildTraderContext(stats, trades, journal);
}
