import { prisma } from '@tradinjournal/db';
import type { UpdateLocationInput, UserLocationDto, AdminGeoDto } from '@tradinjournal/contracts';
import { geocodeLocation } from '../../lib/geocode.js';

export function isLocationComplete(u: {
  country: string | null;
  city: string | null;
  postalCode: string | null;
}): boolean {
  return !!(u.country?.trim() && u.city?.trim() && u.postalCode?.trim());
}

export function toLocationDto(u: {
  country: string | null;
  city: string | null;
  postalCode: string | null;
  lat: number | null;
  lng: number | null;
  locationUpdatedAt: Date | null;
}): UserLocationDto {
  return {
    country: u.country,
    city: u.city,
    postalCode: u.postalCode,
    lat: u.lat,
    lng: u.lng,
    locationUpdatedAt: u.locationUpdatedAt?.toISOString() ?? null,
    complete: isLocationComplete(u),
  };
}

export async function getUserLocation(userId: string): Promise<UserLocationDto | null> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      country: true,
      city: true,
      postalCode: true,
      lat: true,
      lng: true,
      locationUpdatedAt: true,
    },
  });
  return u ? toLocationDto(u) : null;
}

export async function updateUserLocation(
  userId: string,
  input: UpdateLocationInput,
): Promise<UserLocationDto> {
  const coords = await geocodeLocation(input.country, input.city, input.postalCode);
  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      country: input.country,
      city: input.city,
      postalCode: input.postalCode,
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
      locationUpdatedAt: new Date(),
    },
    select: {
      country: true,
      city: true,
      postalCode: true,
      lat: true,
      lng: true,
      locationUpdatedAt: true,
    },
  });
  return toLocationDto(updated);
}

/** Best-effort geocode after signup when lat/lng still empty. */
export async function geocodeUserIfNeeded(userId: string): Promise<void> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { country: true, city: true, postalCode: true, lat: true, lng: true, locationUpdatedAt: true },
  });
  if (!u || !isLocationComplete(u)) return;
  if (u.lat != null && u.lng != null && u.locationUpdatedAt) return;
  const coords =
    u.lat != null && u.lng != null
      ? null
      : await geocodeLocation(u.country!, u.city!, u.postalCode!);
  await prisma.user.update({
    where: { id: userId },
    data: {
      ...(coords ? { lat: coords.lat, lng: coords.lng } : {}),
      locationUpdatedAt: u.locationUpdatedAt ?? new Date(),
    },
  });
}

export async function getAdminGeo(): Promise<AdminGeoDto> {
  const users = await prisma.user.findMany({
    select: {
      country: true,
      city: true,
      postalCode: true,
      lat: true,
      lng: true,
    },
  });

  const totalUsers = users.length;
  const buckets = new Map<string, {
    country: string;
    city: string | null;
    postalCode: string | null;
    lat: number;
    lng: number;
    userCount: number;
  }>();

  let unlocated = 0;
  let locatedUsers = 0;

  for (const u of users) {
    if (u.lat == null || u.lng == null || !Number.isFinite(u.lat) || !Number.isFinite(u.lng)) {
      unlocated += 1;
      continue;
    }
    locatedUsers += 1;
    // Round to ~1km grid so nearby users merge into one heat point
    const latR = Math.round(u.lat * 100) / 100;
    const lngR = Math.round(u.lng * 100) / 100;
    const key = `${latR},${lngR}`;
    const existing = buckets.get(key);
    if (existing) {
      existing.userCount += 1;
    } else {
      buckets.set(key, {
        country: u.country ?? '??',
        city: u.city,
        postalCode: u.postalCode,
        lat: latR,
        lng: lngR,
        userCount: 1,
      });
    }
  }

  const points = [...buckets.values()].sort((a, b) => b.userCount - a.userCount);
  return { points, unlocated, totalUsers, locatedUsers };
}
