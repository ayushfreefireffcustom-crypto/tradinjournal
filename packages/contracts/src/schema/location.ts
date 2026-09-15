import { z } from 'zod';

/** Worldwide location captured at signup / blocking modal. */
export const updateLocationSchema = z.object({
  country: z.string().trim().length(2).transform(s => s.toUpperCase()),
  city: z.string().trim().min(1).max(120),
  postalCode: z.string().trim().min(1).max(32),
});
export type UpdateLocationInput = z.infer<typeof updateLocationSchema>;

export const userLocationDtoSchema = z.object({
  country: z.string().nullable(),
  city: z.string().nullable(),
  postalCode: z.string().nullable(),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  locationUpdatedAt: z.string().nullable(),
  complete: z.boolean(),
});
export type UserLocationDto = z.infer<typeof userLocationDtoSchema>;

export const adminGeoPointSchema = z.object({
  country: z.string(),
  city: z.string().nullable(),
  postalCode: z.string().nullable(),
  lat: z.number(),
  lng: z.number(),
  userCount: z.number().int(),
});
export type AdminGeoPointDto = z.infer<typeof adminGeoPointSchema>;

export const adminGeoDtoSchema = z.object({
  points: z.array(adminGeoPointSchema),
  unlocated: z.number().int(),
  totalUsers: z.number().int(),
  locatedUsers: z.number().int(),
});
export type AdminGeoDto = z.infer<typeof adminGeoDtoSchema>;
