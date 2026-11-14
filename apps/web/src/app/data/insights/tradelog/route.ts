import { mockGate, mockTradelog, okJson, parseWith, queryOf, schemas } from '@/lib/mock-insights';

// Mock of GET /api/insights/tradelog — filtered, sorted, paged rows from the API's queryLog.
export function GET(req: Request) {
  const gate = mockGate(); if (gate) return gate;
  const q = parseWith(schemas.tradelog, queryOf(req)); if ('error' in q) return q.error;
  return okJson(mockTradelog(q.data));
}
