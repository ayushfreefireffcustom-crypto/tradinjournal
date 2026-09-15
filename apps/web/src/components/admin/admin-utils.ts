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

export function statusTone(
  kind: 'elefin' | 'activity' | 'grant',
  value: string,
): 'profit' | 'loss' | 'warning' | 'neutral' {
  if (kind === 'elefin') {
    if (value === 'VERIFIED') return 'profit';
    if (value === 'FAILED') return 'loss';
    return 'warning';
  }
  if (kind === 'activity') {
    if (value === 'ACTIVE') return 'profit';
    if (value === 'INACTIVE') return 'loss';
    return 'neutral';
  }
  if (value === 'ACTIVE') return 'profit';
  return 'loss';
}

export const toneClass = {
  profit: 'text-profit border-profit/30 bg-profit/10',
  loss: 'text-loss border-loss/30 bg-loss/10',
  warning: 'text-warning border-warning/30 bg-warning/10',
  neutral: 'text-fg-2 border-border-soft bg-surface',
} as const;

export function auditLabel(action: string): string {
  return action
    .replace(/\./g, ' · ')
    .replace(/_/g, ' ')
    .toUpperCase();
}
