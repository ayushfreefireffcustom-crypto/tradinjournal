import { env } from '@tradinjournal/config';

/** Platform admin check — merges ADMIN_EMAILS and MACRO_ADMIN_EMAILS. */
export function isAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  return env.ADMIN_EMAILS_LIST.includes(email.trim().toLowerCase());
}
