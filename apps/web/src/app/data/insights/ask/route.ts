import { mockAsk, mockGate, okJson, parseWith, schemas } from '@/lib/mock-insights';

// Mock of POST /api/insights/ask — deterministic "Ask your journal" answers (ask.ts) over the mock book.
export async function POST(req: Request) {
  const gate = mockGate(); if (gate) return gate;
  const q = parseWith(schemas.ask, await req.json().catch(() => null)); if ('error' in q) return q.error;
  return okJson(mockAsk(q.data));
}
