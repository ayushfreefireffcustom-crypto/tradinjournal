import { mockGate, mockTradeReview, notFound, okJson, parseWith, queryOf, schemas } from '@/lib/mock-insights';

// Mock of GET /api/insights/trade-review — the API's computeTradeReview for one mock position.
export function GET(req: Request) {
  const gate = mockGate(); if (gate) return gate;
  const q = parseWith(schemas.review, queryOf(req)); if ('error' in q) return q.error;
  const out = mockTradeReview(q.data.accountId, q.data.positionId);
  return out ? okJson(out) : notFound(`Position #${q.data.positionId} isn't on this account`, 'TRADE_NOT_FOUND');
}
