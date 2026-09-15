// Elefin referral verification — stub until boss provides live API.
import { env } from '@tradinjournal/config';
import { logger } from '@tradinjournal/logger';

export interface ElefinVerifyInput {
  email?: string;
  mt5Login?: number;
}

export interface ElefinVerifyResult {
  verified: boolean;
  elefinUid?: string;
  raw?: unknown;
}

export interface ElefinProvider {
  verifyUnderUs(input: ElefinVerifyInput): Promise<ElefinVerifyResult>;
}

function isProdLike(): boolean {
  return process.env.NODE_ENV === 'production' || env.ELEFIN_VERIFY_MODE === 'live';
}

/** Stub: verifies @elefin.test emails or MT5 logins in ELEFIN_STUB_LOGINS. */
class StubElefinProvider implements ElefinProvider {
  private readonly stubLogins: Set<number>;

  constructor() {
    const raw = process.env.ELEFIN_STUB_LOGINS ?? '';
    this.stubLogins = new Set(
      raw.split(',').map(s => Number(s.trim())).filter(n => Number.isFinite(n) && n > 0),
    );
  }

  async verifyUnderUs(input: ElefinVerifyInput): Promise<ElefinVerifyResult> {
    const email = input.email?.trim().toLowerCase();
    if (email?.endsWith('@elefin.test')) {
      return { verified: true, elefinUid: `stub-email:${email}` };
    }
    if (input.mt5Login && this.stubLogins.has(input.mt5Login)) {
      return { verified: true, elefinUid: `stub-login:${input.mt5Login}` };
    }
    // Dev-only convenience: any login when allowlist empty — NEVER in prod/live mode
    if (!isProdLike() && this.stubLogins.size === 0 && input.mt5Login) {
      logger.warn('[elefin] stub verify accepted any mt5Login (dev only) — set ELEFIN_STUB_LOGINS');
      return { verified: true, elefinUid: `stub-login:${input.mt5Login}` };
    }
    if (isProdLike() && this.stubLogins.size === 0 && input.mt5Login) {
      logger.warn('[elefin] stub rejected mt5Login — empty ELEFIN_STUB_LOGINS in prod/live');
    }
    return { verified: false };
  }
}

/** Live HTTP provider — wire when boss delivers API docs. */
class HttpElefinProvider implements ElefinProvider {
  async verifyUnderUs(input: ElefinVerifyInput): Promise<ElefinVerifyResult> {
    const base = env.ELEFIN_API_URL;
    const key = env.ELEFIN_API_KEY;
    if (!base || !key) {
      throw new Error('ELEFIN_API_URL and ELEFIN_API_KEY required for live mode');
    }
    const res = await fetch(`${base.replace(/\/$/, '')}/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        email: input.email,
        mt5_login: input.mt5Login,
      }),
    });
    if (!res.ok) {
      logger.error('[elefin] verify API error', { status: res.status });
      throw new Error(`Elefin verify failed: HTTP ${res.status}`);
    }
    const json = (await res.json()) as { verified?: boolean; uid?: string; elefin_uid?: string };
    return {
      verified: !!json.verified,
      elefinUid: json.uid ?? json.elefin_uid,
      raw: json,
    };
  }
}

let provider: ElefinProvider | null = null;

export function getElefinProvider(): ElefinProvider {
  if (!provider) {
    provider = env.ELEFIN_VERIFY_MODE === 'live' ? new HttpElefinProvider() : new StubElefinProvider();
  }
  return provider;
}

/** Reset provider (tests). */
export function resetElefinProvider(): void {
  provider = null;
}
