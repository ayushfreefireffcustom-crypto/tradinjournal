import { notFound } from 'next/navigation';
import Gallery from '@/components/v6/ui/gallery';

// Every shared v6 primitive on one page (A2.28), for design review. Development only.
export const metadata = { title: 'UI primitives · TRADElogs', robots: { index: false } };

export default function DevUiPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <Gallery />;
}
