// Client for the price-alerts API. Prisma Decimal fields (threshold, lastPrice)
// serialize to strings over the wire — typed as such; callers Number() them.
export interface PriceAlert {
  id: string;
  symbol: string;
  accountId: string | null;
  direction: 'above' | 'below';
  threshold: string;
  lastPrice: string | null;
  status: string; // active | triggered | disabled
  recurring: boolean;
  note: string | null;
  triggeredAt: string | null;
  createdAt: string;
}

export interface CreateAlertBody {
  symbol: string;
  direction: 'above' | 'below';
  threshold: number;
  accountId?: string;
  recurring?: boolean;
  note?: string;
  seedPrice?: number; // current price from the chart — arms the alert instantly
}

export interface UpdateAlertBody {
  threshold?: number;
  status?: 'active' | 'disabled';
  recurring?: boolean;
  note?: string;
}

const USE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS === 'true';
const PREFIX = USE_MOCKS ? '/data' : '/api';
const API = USE_MOCKS ? '' : process.env.NEXT_PUBLIC_API_URL || '';

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...(USE_MOCKS ? {} : { credentials: 'include' as const }),
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.message ?? `Request failed: ${res.status}`);
  return json.data as T;
}

export const alertsApi = {
  list: () => req<{ alerts: PriceAlert[] }>(`${PREFIX}/alerts`),
  create: (body: CreateAlertBody) => req<PriceAlert>(`${PREFIX}/alerts`, { method: 'POST', body: JSON.stringify(body) }),
  update: (id: string, body: UpdateAlertBody) => req<PriceAlert>(`${PREFIX}/alerts/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  remove: (id: string) => req<{ ok: boolean }>(`${PREFIX}/alerts/${id}`, { method: 'DELETE' }),
};
