'use client';

// Per-user data kept in module memory between page navigations. Cleared whenever
// the signed-in user changes so the next user never sees the previous one's
// broker list or admin/partner role flags.
import { clearAccountsCache } from '@/lib/use-accounts';
import { invalidateAccessCache } from '@/lib/use-platform-access';

export function resetUserCaches() {
  clearAccountsCache();
  invalidateAccessCache();
}
