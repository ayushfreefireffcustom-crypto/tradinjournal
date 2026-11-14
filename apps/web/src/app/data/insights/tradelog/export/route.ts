import { mockGate, mockTradelogExport, okJson, parseWith, queryOf, schemas } from '@/lib/mock-insights';

// Mock of GET /api/insights/tradelog/export — every matching row (CSV export).
export function GET(req: Request) {
  const gate = mockGate(); if (gate) return gate;
  const q = parseWith(schemas.export, queryOf(req)); if ('error' in q) return q.error;
  return okJson(mockTradelogExport(q.data));
}
