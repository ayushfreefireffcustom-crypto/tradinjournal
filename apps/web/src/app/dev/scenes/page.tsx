import { notFound } from 'next/navigation';
import ScenesGallery from './gallery';

// Every empty-state drawing and the error card, for design review. Development only.
export const metadata = { title: 'Drawings · TRADElogs', robots: { index: false } };

export default function DevScenesPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <ScenesGallery />;
}
