import { prisma } from '@tradinjournal/db';
import type { Prisma } from '@tradinjournal/db';
import type { MaintenanceModeDto } from '@tradinjournal/contracts';

const MAINTENANCE_KEY = 'maintenance_mode';

interface MaintenanceValue {
  enabled: boolean;
  message: string | null;
  toggledBy: string | null;
  toggledAt: string | null;
}

const DEFAULT: MaintenanceValue = {
  enabled: false,
  message: null,
  toggledBy: null,
  toggledAt: null,
};

let cache: { value: MaintenanceValue; expiresAt: number } | null = null;
const CACHE_MS = 5_000;

function parseValue(raw: unknown): MaintenanceValue {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT };
  const v = raw as Record<string, unknown>;
  return {
    enabled: !!v.enabled,
    message: typeof v.message === 'string' ? v.message : null,
    toggledBy: typeof v.toggledBy === 'string' ? v.toggledBy : null,
    toggledAt: typeof v.toggledAt === 'string' ? v.toggledAt : null,
  };
}

export function invalidateMaintenanceCache(): void {
  cache = null;
}

export async function getMaintenanceMode(): Promise<MaintenanceModeDto> {
  const now = Date.now();
  if (cache && cache.expiresAt > now) {
    return cache.value;
  }
  const row = await prisma.systemSetting.findUnique({ where: { key: MAINTENANCE_KEY } });
  const value = parseValue(row?.value);
  cache = { value, expiresAt: now + CACHE_MS };
  return value;
}

export async function setMaintenanceMode(
  enabled: boolean,
  actorEmail: string,
  message?: string,
): Promise<MaintenanceModeDto> {
  const value: MaintenanceValue = {
    enabled,
    message: message?.trim() || (enabled ? 'We are performing scheduled maintenance. Please check back soon.' : null),
    toggledBy: actorEmail,
    toggledAt: new Date().toISOString(),
  };
  const json = value as unknown as Prisma.InputJsonValue;
  await prisma.systemSetting.upsert({
    where: { key: MAINTENANCE_KEY },
    create: { key: MAINTENANCE_KEY, value: json, updatedBy: actorEmail },
    update: { value: json, updatedBy: actorEmail },
  });
  invalidateMaintenanceCache();
  return value;
}

export async function isMaintenanceEnabled(): Promise<boolean> {
  const mode = await getMaintenanceMode();
  return mode.enabled;
}
