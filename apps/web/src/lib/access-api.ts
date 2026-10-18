export type PlatformAccessStatus =
  | 'FULL_ACCESS'
  | 'ELEFIN_REQUIRED'
  | 'INACTIVE'
  | 'MAINTENANCE';

export interface AccessStatusDto {
  status: PlatformAccessStatus;
  source: 'MANUAL_GRANT' | 'ELEFIN_VERIFIED' | null;
  elefinStatus: 'PENDING' | 'VERIFIED' | 'FAILED';
  activityStatus: 'UNKNOWN' | 'ACTIVE' | 'INACTIVE';
  tradeCount7d: number;
  minTradesRequired: number;
  activityWindowDays: number;
  isAdmin: boolean;
  maintenance: { enabled: boolean; message: string | null };
}

export interface VerifyElefinInput {
  email?: string;
  mt5Login?: number;
}

export interface ActivityCheckResult {
  active: boolean;
  tradeCount7d: number;
  minTradesRequired: number;
  activityWindowDays: number;
}

export interface MaintenanceModeDto {
  enabled: boolean;
  message: string | null;
  toggledBy: string | null;
  toggledAt: string | null;
}

const USE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS === 'true';
const API = USE_MOCKS ? '' : (process.env.NEXT_PUBLIC_API_URL || '');

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...(USE_MOCKS ? {} : { credentials: 'include' as const }),
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  });
  const json = await res.json();
  if (!res.ok) {
    const err = new Error(json?.error?.message ?? `Request failed: ${res.status}`) as Error & { code?: string };
    err.code = json?.error?.code;
    throw err;
  }
  return json.data as T;
}

export const accessApi = {
  status: () => req<AccessStatusDto>(USE_MOCKS ? '/data/access/status' : '/api/access/status'),
  verifyElefin: (body: VerifyElefinInput) =>
    req<AccessStatusDto>('/api/access/verify-elefin', { method: 'POST', body: JSON.stringify(body) }),
  checkActivity: () => req<ActivityCheckResult>('/api/access/check-activity', { method: 'POST' }),
  maintenance: () => req<MaintenanceModeDto>('/api/access/maintenance'),
};
