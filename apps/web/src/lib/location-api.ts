export interface UserLocationDto {
  country: string | null;
  city: string | null;
  postalCode: string | null;
  lat: number | null;
  lng: number | null;
  locationUpdatedAt: string | null;
  complete: boolean;
}

export interface UpdateLocationInput {
  country: string;
  city: string;
  postalCode: string;
}

export interface PlaceSuggestion {
  id: string;
  label: string;
  city: string;
  postalCode: string;
  country: string;
  lat: number | null;
  lng: number | null;
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
    throw new Error(json?.error?.message ?? `Request failed: ${res.status}`);
  }
  return json.data as T;
}

export const locationApi = {
  get: () => req<UserLocationDto>('/api/me/location'),
  update: (body: UpdateLocationInput) =>
    req<UserLocationDto>('/api/me/location', { method: 'PATCH', body: JSON.stringify(body) }),
  suggest: (kind: 'city' | 'postal', q: string, country: string) => {
    const params = new URLSearchParams({ kind, q, country });
    return req<PlaceSuggestion[]>(`/api/me/location/suggest?${params}`);
  },
};

export function isLocationComplete(u: {
  country?: string | null;
  city?: string | null;
  postalCode?: string | null;
} | null | undefined): boolean {
  return !!(u?.country?.trim() && u?.city?.trim() && u?.postalCode?.trim());
}
