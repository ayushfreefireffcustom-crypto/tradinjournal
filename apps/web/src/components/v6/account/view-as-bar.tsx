'use client';

// Floating pill on partner pages while an admin views as a partner: who, read-only, Exit.
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Eye } from '@phosphor-icons/react';
import { clearViewAs, getViewAs, type ViewAs } from '@/lib/view-as';
import '@/styles/v6/access.css';

export default function ViewAsBar() {
  const router = useRouter();
  const [v, setV] = useState<ViewAs | null>(null);
  useEffect(() => { const u = () => setV(getViewAs()); u(); window.addEventListener('tl:view-as', u); return () => window.removeEventListener('tl:view-as', u); }, []);
  if (!v) return null;
  return (
    <div className="v6 ax-viewas" role="status" data-testid="view-as-bar">
      <Eye size={15} weight="bold" aria-hidden />
      <span>Viewing as <b>{v.name}</b> · read-only</span>
      <button type="button" onClick={() => { const id = v.id; clearViewAs(); router.push(`/admin/partners/${id}`); }} data-testid="view-as-exit">Exit</button>
    </div>
  );
}
