import { ok } from '@/lib/mock-data';

// Mock DELETE so the /settings delete flow works in backend-free preview mode.
// The mock store is static, so this just acknowledges; the real API enforces
// ownership and the 2-account limit.
export async function DELETE() {
  return ok({ ok: true });
}
