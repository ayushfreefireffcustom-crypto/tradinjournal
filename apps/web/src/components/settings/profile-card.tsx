'use client';

// Profile header for the Settings page — avatar, name, email, sign-out, location,
// and a couple of at-a-glance stats.
import { useCallback, useEffect, useState } from 'react';
import { authClient } from '@/lib/auth-client';
import { countryName } from '@/lib/countries';
import { locationApi, type UserLocationDto } from '@/lib/location-api';
import LocationForm from '@/components/location-form';

function initialsOf(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .map(w => w[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || 'T'
  );
}

export default function ProfileCard({ accountCount }: { accountCount: number }) {
  const { data: session } = authClient.useSession();
  const name = session?.user?.name ?? 'Trader';
  const email = session?.user?.email ?? '';
  const [loc, setLoc] = useState<UserLocationDto | null>(null);
  const [editing, setEditing] = useState(false);

  const loadLoc = useCallback(() => {
    locationApi.get().then(setLoc).catch(() => setLoc(null));
  }, []);

  useEffect(() => {
    loadLoc();
  }, [loadLoc]);

  return (
    <section className="v3-card pf" data-testid="profile-card">
      <div className="pf-band" aria-hidden>
        <svg viewBox="0 0 600 120" preserveAspectRatio="none"><path className="pf-ln" d="M0,102 L70,96 L120,104 L190,82 L250,86 L330,64 L400,70 L460,48 L530,54 L600,30" /></svg>
      </div>
      <div className="pf-bd">
        <div className="pf-id">
          <span className="pf-av">{initialsOf(name)}</span>
          <div className="pf-nm">
            <h2>{name}</h2>
            <p>{email}{loc?.complete && <> · {loc.city}, {countryName(loc.country)}</>}</p>
          </div>
          <button onClick={() => authClient.signOut()} data-testid="profile-signout" className="v3-btn v3-btn--o">Sign out</button>
        </div>
        <div className="pf-stats">
          <div><span>Connected accounts</span><b className="num">{accountCount} / 2</b></div>
          <div><span>Plan</span><b>Free</b></div>
          <div><span>Data source</span><b>MT5 auto-sync</b></div>
        </div>
        <div className="pf-loc" data-testid="profile-location">
          <div className="t"><span>Location</span><button type="button" className="v3-link" onClick={() => setEditing(e => !e)}>{editing ? 'Cancel' : 'Edit'}</button></div>
          {!editing ? (
            <b>{loc?.complete ? `${loc.city}, ${countryName(loc.country)} · ${loc.postalCode}` : <span className="am">Not set — required</span>}</b>
          ) : (
            <div style={{ marginTop: 12 }}><LocationForm initial={loc ?? undefined} submitLabel="Save location" onSaved={() => { setEditing(false); loadLoc(); }} /></div>
          )}
        </div>
      </div>
    </section>
  );
}
