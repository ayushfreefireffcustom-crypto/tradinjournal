import { BRIEF } from '@/lib/mock-news';

// Mock brief: streams the canned bullets word by word like the real SSE endpoint.
export function GET() {
  const enc = new TextEncoder();
  const words = BRIEF.join('').split(/(?<= )/);
  const body = new ReadableStream({
    async start(c) {
      for (const w of words) { c.enqueue(enc.encode(`data: ${JSON.stringify({ token: w })}\n\n`)); await new Promise(r => setTimeout(r, 18)); }
      c.enqueue(enc.encode(`data: ${JSON.stringify({ done: true })}\n\n`)); c.close();
    },
  });
  return new Response(body, { headers: { 'Content-Type': 'text/event-stream' } });
}
