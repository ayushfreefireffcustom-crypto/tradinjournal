// Mock-mode live stream: closes immediately (charts keep their loaded history).
export function GET() {
  return new Response('', { headers: { 'Content-Type': 'text/event-stream' } });
}
