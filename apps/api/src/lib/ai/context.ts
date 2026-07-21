// Loads a trader's grounding context for the AI coach by reusing the exact same
// server-side data the dashboard already computes (stats + trades) plus their
// journal, then folding it into the compact TraderContext card from core.
//
// Stats + trades come from a SINGLE bridge fetch (fetchStatsAndTrades): the MT5
// bridge serialises on one terminal, so fetching them separately/concurrently
// would double-hit the terminal and fail. The journal is a DB read, so it can
// run in parallel safely.
import { buildTraderContext, type TraderContext } from '@tradinjournal/core';
import { fetchStatsAndTrades } from '../../modules/trades/trades.service.js';
import { listJournalEntries } from '../../modules/journal/journal.service.js';

export async function loadTraderContext(userId: string, accountId: string): Promise<TraderContext> {
  const [{ stats, trades }, journal] = await Promise.all([
    fetchStatsAndTrades(userId, accountId),
    listJournalEntries(userId, accountId),
  ]);
  return buildTraderContext(stats, trades, journal);
}
