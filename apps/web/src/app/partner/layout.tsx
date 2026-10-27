import { notFound } from 'next/navigation';
import { PARTNERS_ENABLED } from '@/lib/features';

export default function PartnerLayout({ children }: { children: React.ReactNode }) {
  if (!PARTNERS_ENABLED) notFound();
  return children;
}
