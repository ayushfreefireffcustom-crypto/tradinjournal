import { mockAnalytics, mockGate, okJson, parseWith, queryOf, schemas } from '@/lib/mock-insights';

// Mock of GET /api/insights/analytics — the API's computeAnalytics over the seeded mock book.
export function GET(req: Request) {
  const gate = mockGate(); if (gate) return gate;
  const q = parseWith(schemas.analytics, queryOf(req)); if ('error' in q) return q.error;
  return okJson(mockAnalytics(q.data));
}
