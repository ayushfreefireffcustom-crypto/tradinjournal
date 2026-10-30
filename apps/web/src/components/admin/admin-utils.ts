export function fmtRelative(iso: string | null): string {
  if (!iso) return 'Never';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function pct(part: number, total: number): number {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}

export type Tone = 'g' | 'r' | 'n';

/** Tag tone for a status: green good, red bad, neutral for pending/unknown. */
export function statusTone(kind: 'elefin' | 'activity' | 'grant', value: string): Tone {
  if (kind === 'elefin') return value === 'VERIFIED' ? 'g' : value === 'FAILED' ? 'r' : 'n';
  if (kind === 'activity') return value === 'ACTIVE' ? 'g' : value === 'INACTIVE' ? 'r' : 'n';
  return value === 'ACTIVE' ? 'g' : 'r';
}

export const tagClass: Record<Tone, string> = { g: 'x-tag x-tag--g', r: 'x-tag x-tag--r', n: 'x-tag' };

/** "VERIFIED" / "NO_BROKER" → "Verified" / "No broker". */
export function sentence(value: string): string {
  const s = value.replace(/[_.]/g, ' ').toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** "grant.create" → "Grant · create". */
export function auditLabel(action: string): string {
  const s = action.replace(/\./g, ' · ').replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}
