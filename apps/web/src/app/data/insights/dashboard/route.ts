import { mockDashboard, mockGate, okJson, parseWith, queryOf, schemas } from '@/lib/mock-insights';

// Mock of GET /api/insights/dashboard — the API's computeDashboard over the seeded mock book.
export function GET(req: Request) {
  const gate = mockGate(); if (gate) return gate;
  const q = parseWith(schemas.dashboard, queryOf(req)); if ('error' in q) return q.error;
  return okJson(mockDashboard(q.data));
}
