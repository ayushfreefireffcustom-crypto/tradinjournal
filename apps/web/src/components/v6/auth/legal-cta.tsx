'use client';

import Link from '@/components/v6/ui/link';
import { useSignedIn } from '@/lib/use-signed-in';

/** Header action on the legal pages: back into the app when signed in, else sign in. */
export default function LegalCta() {
  const signedIn = useSignedIn();
  return signedIn
    ? <Link href="/dashboard" className="x-btn x-btn--sm x-btn--hi">Open dashboard</Link>
    : <Link href="/login" className="x-btn x-btn--sm x-btn--hi">Sign in</Link>;
}
