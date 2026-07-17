'use client';

// "Continue with Google" button used on both the login and signup screens.
// Kicks off the better-auth social flow; on success Google redirects back to
// {API}/api/auth/callback/google which lands the user on /brokers.

import { useState } from 'react';
import { authClient } from '@/lib/auth-client';

export default function GoogleButton({ label = 'Continue with Google' }: { label?: string }) {
  const [loading, setLoading] = useState(false);

  async function go() {
    setLoading(true);
    try {
      // Absolute URLs to the web app: better-auth resolves a relative callbackURL
      // against the API origin (localhost:4000 / api.tradelogs.com), which has no
      // page routes. Pointing at window.location.origin sends the user back here.
      const origin = window.location.origin;
      await authClient.signIn.social({
        provider: 'google',
        callbackURL: `${origin}/brokers`,
        errorCallbackURL: `${origin}/login`,
      });
    } catch {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={go}
      disabled={loading}
      data-testid="google-signin"
      className={`btn justify-center gap-3 py-3 text-[12px] tracking-[0.16em] w-full border border-border-strong hover:border-fg bg-transparent ${loading ? 'opacity-70 cursor-wait' : ''}`}
    >
      <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden>
        <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
        <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.34A9 9 0 0 0 9 18z" />
        <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.94H.96a9 9 0 0 0 0 8.12l3.01-2.34z" />
        <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.47.9 11.43 0 9 0A9 9 0 0 0 .96 4.94l3.01 2.34C4.68 5.16 6.66 3.58 9 3.58z" />
      </svg>
      {loading ? 'CONNECTING…' : label.toUpperCase()}
    </button>
  );
}
