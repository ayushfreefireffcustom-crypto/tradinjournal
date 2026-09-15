'use client';

import { useCallback, useEffect, useState } from 'react';
import { authClient } from '@/lib/auth-client';
import { isLocationComplete, locationApi } from '@/lib/location-api';
import LocationForm from '@/components/location-form';

/**
 * Blocks the authenticated shell until country + city + postal are on file.
 * Uses session fields when present; falls back to GET /api/me/location.
 */
export default function LocationGate() {
  const { data: session } = authClient.useSession();
  const user = session?.user as {
    country?: string | null;
    city?: string | null;
    postalCode?: string | null;
  } | undefined;

  const [needed, setNeeded] = useState(false);
  const [ready, setReady] = useState(false);
  const [initial, setInitial] = useState<{
    country?: string | null;
    city?: string | null;
    postalCode?: string | null;
  }>({});

  const check = useCallback(async () => {
    if (!session?.session) {
      setNeeded(false);
      setReady(true);
      return;
    }
    if (isLocationComplete(user)) {
      setNeeded(false);
      setReady(true);
      return;
    }
    try {
      const loc = await locationApi.get();
      if (loc.complete) {
        setNeeded(false);
      } else {
        setInitial({ country: loc.country, city: loc.city, postalCode: loc.postalCode });
        setNeeded(true);
      }
    } catch {
      // Fail closed — require the form if we cannot confirm completeness.
      setNeeded(true);
    } finally {
      setReady(true);
    }
  }, [session?.session, user]);

  useEffect(() => {
    void check();
  }, [check]);

  if (!ready || !needed) return null;

  return (
    <LocationForm
      blocking
      initial={initial}
      onSaved={() => {
        setNeeded(false);
        void check();
      }}
    />
  );
}
