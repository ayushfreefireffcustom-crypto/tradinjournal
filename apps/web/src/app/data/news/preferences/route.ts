import { ok } from '@/lib/mock-data';
import { newsPrefs, setNewsPrefs } from '@/lib/mock-news';
export function GET() { return ok({ sources: newsPrefs() }); }
export async function PUT(req: Request) { const b = await req.json().catch(() => ({})); setNewsPrefs(Array.isArray(b.sources) ? b.sources : []); return ok({ sources: newsPrefs() }); }
