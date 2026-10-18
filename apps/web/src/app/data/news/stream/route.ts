// Mock live stream: closes immediately (the feed's poll keeps it fresh).
export function GET() { return new Response('', { headers: { 'Content-Type': 'text/event-stream' } }); }
