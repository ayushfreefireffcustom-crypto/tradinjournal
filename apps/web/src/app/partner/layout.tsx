import { notFound } from 'next/navigation';
import { PARTNERS_ENABLED } from '@/lib/features';
import ViewAsBar from '@/components/v6/account/view-as-bar';

export default function PartnerLayout({ children }: { children: React.ReactNode }) {
  if (!PARTNERS_ENABLED) notFound();
  return <>{children}<ViewAsBar /></>;
}
