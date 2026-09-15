// Nominatim (OpenStreetMap) geocoding — best-effort, no API key.
import { logger } from '@tradinjournal/logger';

export interface GeoCoords {
  lat: number;
  lng: number;
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

const cache = new Map<string, GeoCoords | null>();
const suggestCache = new Map<string, PlaceSuggestion[]>();

const NOMINATIM_HEADERS = {
  'User-Agent': 'TradeLogs/1.0 (location; contact@tradelogs.com)',
  Accept: 'application/json',
};

type NominatimRow = {
  place_id?: number;
  lat?: string;
  lon?: string;
  display_name?: string;
  address?: {
    city?: string;
    town?: string;
    village?: string;
    municipality?: string;
    suburb?: string;
    county?: string;
    state?: string;
    postcode?: string;
    country_code?: string;
  };
};

function cacheKey(country: string, city: string, postalCode: string): string {
  return `${country}|${city}|${postalCode}`.toLowerCase();
}

function placeName(addr: NominatimRow['address']): string {
  if (!addr) return '';
  return (
    addr.city ||
    addr.town ||
    addr.village ||
    addr.municipality ||
    addr.suburb ||
    addr.county ||
    ''
  );
}

function toSuggestion(row: NominatimRow, fallbackCountry: string): PlaceSuggestion | null {
  const addr = row.address;
  const city = placeName(addr);
  const postal = addr?.postcode?.trim() ?? '';
  const country = (addr?.country_code ?? fallbackCountry).toUpperCase();
  if (!city && !postal) return null;
  const lat = row.lat != null ? Number(row.lat) : null;
  const lng = row.lon != null ? Number(row.lon) : null;
  const parts = [city, postal, country].filter(Boolean);
  return {
    id: String(row.place_id ?? `${city}-${postal}-${lat}-${lng}`),
    label: row.display_name?.split(',').slice(0, 3).join(',').trim() || parts.join(' · '),
    city: city || postal,
    postalCode: postal,
    country: country.slice(0, 2),
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
  };
}

/** Autocomplete cities or postal codes within a country. */
export async function suggestPlaces(
  kind: 'city' | 'postal',
  query: string,
  country: string,
): Promise<PlaceSuggestion[]> {
  const q = query.trim();
  const cc = country.trim().toUpperCase();
  if (q.length < 2 || cc.length !== 2) return [];

  const key = `${kind}|${cc}|${q.toLowerCase()}`;
  if (suggestCache.has(key)) return suggestCache.get(key)!;

  try {
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.set('format', 'json');
    url.searchParams.set('addressdetails', '1');
    url.searchParams.set('limit', '7');
    url.searchParams.set('countrycodes', cc.toLowerCase());
    if (kind === 'city') {
      url.searchParams.set('city', q);
    } else {
      url.searchParams.set('postalcode', q);
    }

    const res = await fetch(url.toString(), { headers: NOMINATIM_HEADERS });
    if (!res.ok) {
      logger.warn('[geocode] suggest non-OK', { status: res.status, kind, q });
      suggestCache.set(key, []);
      return [];
    }

    const rows = (await res.json()) as NominatimRow[];
    const seen = new Set<string>();
    const out: PlaceSuggestion[] = [];
    for (const row of rows) {
      const s = toSuggestion(row, cc);
      if (!s) continue;
      const dedupe = `${s.city}|${s.postalCode}`.toLowerCase();
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      out.push(s);
    }

    if (out.length === 0) {
      const fallback = new URL('https://nominatim.openstreetmap.org/search');
      fallback.searchParams.set('q', `${q}, ${cc}`);
      fallback.searchParams.set('format', 'json');
      fallback.searchParams.set('addressdetails', '1');
      fallback.searchParams.set('limit', '7');
      fallback.searchParams.set('countrycodes', cc.toLowerCase());
      const res2 = await fetch(fallback.toString(), { headers: NOMINATIM_HEADERS });
      if (res2.ok) {
        const rows2 = (await res2.json()) as NominatimRow[];
        for (const row of rows2) {
          const s = toSuggestion(row, cc);
          if (!s) continue;
          const dedupe = `${s.city}|${s.postalCode}`.toLowerCase();
          if (seen.has(dedupe)) continue;
          seen.add(dedupe);
          out.push(s);
        }
      }
    }

    suggestCache.set(key, out);
    return out;
  } catch (err) {
    logger.warn('[geocode] suggest failed', { kind, q, err });
    suggestCache.set(key, []);
    return [];
  }
}

/** Resolve lat/lng from worldwide address fields. Returns null on failure. */
export async function geocodeLocation(
  country: string,
  city: string,
  postalCode: string,
): Promise<GeoCoords | null> {
  const key = cacheKey(country, city, postalCode);
  if (cache.has(key)) return cache.get(key) ?? null;

  const q = `${postalCode}, ${city}, ${country}`;
  try {
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.set('q', q);
    url.searchParams.set('format', 'json');
    url.searchParams.set('limit', '1');
    url.searchParams.set('countrycodes', country.toLowerCase());

    const res = await fetch(url.toString(), { headers: NOMINATIM_HEADERS });
    if (!res.ok) {
      logger.warn('[geocode] nominatim non-OK', { status: res.status, q });
      cache.set(key, null);
      return null;
    }
    const rows = (await res.json()) as Array<{ lat?: string; lon?: string }>;
    const first = rows[0];
    if (!first?.lat || !first?.lon) {
      cache.set(key, null);
      return null;
    }
    const coords = { lat: Number(first.lat), lng: Number(first.lon) };
    if (!Number.isFinite(coords.lat) || !Number.isFinite(coords.lng)) {
      cache.set(key, null);
      return null;
    }
    cache.set(key, coords);
    return coords;
  } catch (err) {
    logger.warn('[geocode] failed', { q, err });
    cache.set(key, null);
    return null;
  }
}
