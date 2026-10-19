import { ok } from '@/lib/mock-data';
import { mockAdminPartners } from '@/lib/mock-partner';
export function GET() { return ok(mockAdminPartners()); }
