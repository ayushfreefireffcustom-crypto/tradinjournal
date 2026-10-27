'use client';

import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { adminApi, type AdminGeoDto } from '@/lib/admin-api';
import { countryName } from '@/lib/countries';

/** Esri dark-gray canvas: keyless (Carto's dark_all now serves "API key required" tiles). */
const TILE_URL = 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}';
const TILE_ATTR = 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ';

export function AdminGeoMap() {
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const [geo, setGeo] = useState<AdminGeoDto | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    adminApi
      .geo()
      .then(d => { if (!cancelled) setGeo(d); })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : 'Geo failed'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!geo || !mapEl.current || geo.points.length === 0) return;

    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }

    const map = L.map(mapEl.current, {
      zoomControl: true,
      attributionControl: true,
      scrollWheelZoom: false,
    });
    mapRef.current = map;

    L.tileLayer(TILE_URL, { attribution: TILE_ATTR, maxZoom: 16 }).addTo(map);

    const maxCount = Math.max(...geo.points.map(p => p.userCount), 1);
    const bounds: L.LatLngTuple[] = [];

    for (const p of geo.points) {
      const r = 8 + (p.userCount / maxCount) * 28;
      const circle = L.circleMarker([p.lat, p.lng], {
        radius: r,
        color: '#08C465',
        fillColor: '#08C465',
        fillOpacity: 0.35 + (p.userCount / maxCount) * 0.45,
        weight: 1.5,
        opacity: 0.9,
      });
      const label = [
        p.city || 'Unknown city',
        countryName(p.country),
        p.postalCode ? `· ${p.postalCode}` : '',
        `· ${p.userCount} user${p.userCount === 1 ? '' : 's'}`,
      ].filter(Boolean).join(' ');
      circle.bindPopup(label);
      circle.addTo(map);
      bounds.push([p.lat, p.lng]);
    }

    if (bounds.length === 1) {
      map.setView(bounds[0]!, 4);
    } else {
      map.fitBounds(bounds, { padding: [28, 28], maxZoom: 6 });
    }

    const t = setTimeout(() => map.invalidateSize(), 80);

    return () => {
      clearTimeout(t);
      map.remove();
      mapRef.current = null;
    };
  }, [geo]);

  const topCities = (geo?.points ?? [])
    .slice()
    .sort((a, b) => b.userCount - a.userCount)
    .slice(0, 8);

  return (
    <div className="tcard p-4 sm:p-5 min-w-0" data-testid="admin-geo-map">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        <div className="text-[10px] tracking-[0.2em] text-fg-3 uppercase">User locations</div>
        {geo && (
          <div className="text-[10px] text-fg-3 numeric">
            {geo.locatedUsers} mapped · {geo.unlocated} unlocated · {geo.totalUsers} total
          </div>
        )}
      </div>

      {loading && <p className="text-sm text-fg-3 py-8 text-center">Loading map…</p>}
      {error && <p className="text-sm text-loss">{error}</p>}

      {!loading && !error && geo && geo.points.length === 0 && (
        <p className="text-sm text-fg-3 py-8 text-center">
          No geocoded users yet. Locations appear after signup / location gate + geocode.
        </p>
      )}

      {geo && geo.points.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <div
            ref={mapEl}
            className="lg:col-span-2 h-[280px] sm:h-[340px] rounded-md overflow-hidden border border-border-soft bg-app z-0"
            data-testid="admin-geo-leaflet"
          />
          <div className="min-w-0">
            <div className="text-[9px] tracking-widest text-fg-3 mb-2">TOP CLUSTERS</div>
            <ul className="space-y-1.5">
              {topCities.map((p, i) => (
                <li
                  key={`${p.lat}-${p.lng}-${i}`}
                  className="flex items-center justify-between gap-2 text-[11px] border border-border-soft rounded px-2 py-1.5 bg-app/40"
                >
                  <span className="truncate text-fg">
                    {p.city ?? '—'}, {countryName(p.country)}
                  </span>
                  <span className="numeric text-profit shrink-0">{p.userCount}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
