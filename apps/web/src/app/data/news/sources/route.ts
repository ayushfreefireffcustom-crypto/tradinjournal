import { ok } from '@/lib/mock-data';
import { MOCK_SOURCES } from '@/lib/mock-news';
export function GET() { return ok({ sources: MOCK_SOURCES }); }
