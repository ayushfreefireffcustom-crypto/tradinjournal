import { mockGate, mockTradelogPaths, okJson, parseWith, schemas } from '@/lib/mock-insights';

// Mock of POST /api/insights/tradelog/paths — mini price paths from seeded candles via the API's buildPath.
export async function POST(req: Request) {
  const gate = mockGate(); if (gate) return gate;
  const q = parseWith(schemas.paths, await req.json().catch(() => null)); if ('error' in q) return q.error;
  return okJson(mockTradelogPaths(q.data.accountId, q.data.ids));
}
