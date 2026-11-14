import { mockGate, mockTradelogTag, okJson, parseWith, schemas } from '@/lib/mock-insights';

// Mock of POST /api/insights/tradelog/tag — bulk tag into the in-memory mock journal.
export async function POST(req: Request) {
  const gate = mockGate(); if (gate) return gate;
  const q = parseWith(schemas.tag, await req.json().catch(() => null)); if ('error' in q) return q.error;
  return okJson(mockTradelogTag(q.data.accountId, q.data.ids, q.data.tag));
}
