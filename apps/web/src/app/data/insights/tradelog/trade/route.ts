import { mockGate, mockTradelogTrade, notFound, okJson, parseWith, queryOf, schemas } from '@/lib/mock-insights';

// Mock of GET /api/insights/tradelog/trade — the side panel's detail for one position.
export function GET(req: Request) {
  const gate = mockGate(); if (gate) return gate;
  const q = parseWith(schemas.trade, queryOf(req)); if ('error' in q) return q.error;
  const d = mockTradelogTrade(q.data.accountId, q.data.id, q.data.tz);
  return d ? okJson(d) : notFound('Trade not found');
}
