'use client';

// Shown in place of a page the admin locked to partner-package holders.
import Link from '@/components/v6/ui/link';
import { LockSimple } from '@phosphor-icons/react';
import '@/styles/v6/ib.css';

export function LockedFeature({ label }: { label: string }) {
  return (
    <div className="x-page">
      <section className="x-card ib-locked" data-testid="perk-locked">
        <span className="ib-hero-ic"><LockSimple size={30} weight="duotone" aria-hidden /></span>
        <h2>{label} comes with a partner package</h2>
        <p>Open a broker account through a TRADElogs partner, connect it here and keep trading to unlock it. Your Access page shows exactly what&rsquo;s left.</p>
        <Link href="/access" className="x-btn x-btn--hi">See my access</Link>
      </section>
    </div>
  );
}
