import { impactTone } from '@/lib/macro-format';

/** Event impact chip: high is red, medium a plain tag, low and unknown dimmed. */
export function ImpactTag({ impact }: { impact: string | null | undefined }) {
  const t = impactTone(impact);
  if (t === 'high') return <span className="x-tag x-tag--r mc-imp">High</span>;
  if (t === 'medium') return <span className="x-tag mc-imp">Medium</span>;
  if (t === 'low') return <span className="x-tag mc-imp mc-imp--low">Low</span>;
  return <span className="x-tag mc-imp mc-imp--low">{impact ? impact : '—'}</span>;
}
