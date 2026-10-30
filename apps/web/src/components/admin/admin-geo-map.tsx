'use client';

import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { adminApi, type AdminGeoDto } from '@/lib/admin-api';
import { countryName } from '@/lib/countries';

/** Esri gray canvases: keyless (Carto's dark_all now serves "API key required" tiles). */
const tileUrl = (light: boolean) =>
  `https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_${light ? 'Light' : 'Dark'}_Gray_Base/MapServer/tile/{z}/{y}/{x}`;

/** Follows the frame's light/dark switch (html[data-theme]). */
function useLightTheme() {
  const [light, setLight] = useState(false);
  useEffect(() => {
    const read = () => setLight(document.documentElement.dataset.theme === 'light');
    read();
    const mo = new MutationObserver(read);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => mo.disconnect();
  }, []);
  return light;
}
const TILE_ATTR = 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ';

export function AdminGeoMap() {
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const [geo, setGeo] = useState<AdminGeoDto | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const light = useLightTheme();

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

    L.tileLayer(tileUrl(light), { attribution: TILE_ATTR, maxZoom: 16 }).addTo(map);

    const brand = getComputedStyle(mapEl.current).getPropertyValue('--g').trim() || 'currentColor';
    const maxCount = Math.max(...geo.points.map(p => p.userCount), 1);
    const bounds: L.LatLngTuple[] = [];

    for (const p of geo.points) {
      const r = 8 + (p.userCount / maxCount) * 28;
      const circle = L.circleMarker([p.lat, p.lng], {
        radius: r,
        color: brand,
        fillColor: brand,
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
  }, [geo, light]);

  const topCities = (geo?.points ?? [])
    .slice()
    .sort((a, b) => b.userCount - a.userCount)
    .slice(0, 8);

  return (
    <section className="x-card" data-testid="admin-geo-map">
      <div className="x-ch">
        <h2>User locations</h2>
        {geo && <span className="x-sub"><span className="m">{geo.locatedUsers}</span> mapped · <span className="m">{geo.unlocated}</span> unlocated · <span className="m">{geo.totalUsers}</span> total</span>}
      </div>

      {loading && <div className="x-skel x-skel--in ad-map-sk" />}
      {error && <div className="x-banner x-banner--err"><span>{error}</span></div>}

      {!loading && !error && geo && geo.points.length === 0 && (
        <div className="x-empty"><p>No geocoded users yet. Locations appear after signup or the location prompt.</p></div>
      )}

      {geo && geo.points.length > 0 && (
        <div className="ad-geo">
          <div ref={mapEl} className="ad-map" data-testid="admin-geo-leaflet" />
          <div className="ad-geo-list">
            <span className="x-label">Top clusters</span>
            <ul>
              {topCities.map((p, i) => (
                <li key={`${p.lat}-${p.lng}-${i}`}>
                  <span>{p.city ?? '—'}, {countryName(p.country)}</span>
                  <b className="m">{p.userCount}</b>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}
