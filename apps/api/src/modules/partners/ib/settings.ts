// Programme settings (active-trader rule, grace periods, locked features), stored in
// SystemSetting so the admin can change them without a deploy.
import { prisma } from '@tradinjournal/db';
import type { ProgramSettingsDto } from '@tradinjournal/contracts';
import { DEFAULT_SETTINGS, mergeSettings } from './ib.logic.js';
import { isPerk } from './perks.js';

const KEY = 'partner.program';
const CACHE_MS = 30_000;
let cache: { value: ProgramSettingsDto; at: number } | null = null;

export async function getProgramSettings(): Promise<ProgramSettingsDto> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;
  const row = await prisma.systemSetting.findUnique({ where: { key: KEY } });
  const value = mergeSettings(row?.value);
  cache = { value, at: Date.now() };
  return value;
}

export async function saveProgramSettings(input: ProgramSettingsDto, by: string): Promise<ProgramSettingsDto> {
  const value = mergeSettings({ ...input, lockedPerks: [...new Set(input.lockedPerks.filter(isPerk))] });
  await prisma.systemSetting.upsert({
    where: { key: KEY },
    create: { key: KEY, value: value as object, updatedBy: by },
    update: { value: value as object, updatedBy: by },
  });
  cache = { value, at: Date.now() };
  return value;
}

export function invalidateProgramSettings(): void {
  cache = null;
}

/** Last loaded settings without I/O (defaults before the first load). */
export function settingsSnapshot(): ProgramSettingsDto {
  return cache?.value ?? DEFAULT_SETTINGS;
}
