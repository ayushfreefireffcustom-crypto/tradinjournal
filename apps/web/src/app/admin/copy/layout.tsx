import { notFound } from 'next/navigation';
import { TRADING_ENABLED } from '@/lib/features';

export default function AdminCopyLayout({ children }: { children: React.ReactNode }) {
  if (!TRADING_ENABLED) notFound();
  return children;
}
