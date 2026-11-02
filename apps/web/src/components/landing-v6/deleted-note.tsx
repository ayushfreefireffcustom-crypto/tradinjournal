'use client';

// Shown once on the landing page after someone deletes their account (H6).
import { useEffect, useState } from 'react';
import { IClose } from '@/components/v6/icons';

export default function DeletedNote() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const u = new URL(window.location.href);
    if (u.searchParams.get('deleted') !== '1') return;
    setShow(true);
    u.searchParams.delete('deleted');
    window.history.replaceState(null, '', u.pathname + u.search + u.hash);
  }, []);
  if (!show) return null;
  return (
    <div role="status" className="lp6-deleted" data-testid="deleted-note">
      Your account and its data have been deleted. Thanks for trying TRADElogs.
      <button type="button" onClick={() => setShow(false)} aria-label="Dismiss"><IClose size={14} /></button>
    </div>
  );
}
