import { ok } from '@/lib/mock-data';
import { mockMacroState } from '@/lib/mock-macro';
export function GET() { return ok(mockMacroState()); }
