'use client';

// Auth client with two modes, switched by NEXT_PUBLIC_USE_MOCKS:
//   • "true" → a local mock that always returns a signed-in test user, so the
//              dashboard/analytics/journal pages are reachable without a
//              backend (UI preview mode).
//   • else   → the real better-auth client talking to the Express API.
//
// Both expose the same surface (useSession / signIn.email / signIn.social /
// signUp.email / signOut) so pages don't branch on the mode.
import { createAuthClient } from 'better-auth/react';

const USE_MOCKS = process.env.NEXT_PUBLIC_USE_MOCKS === 'true';

const MOCK_SESSION = {
  data: {
    session: {
      id: 'mock-session',
      userId: 'mock-user',
      expiresAt: new Date(Date.now() + 86400000),
      ipAddress: '127.0.0.1',
      userAgent: 'mock',
    },
    user: {
      id: 'mock-user',
      email: 'trader@tradinx.io',
      emailVerified: true,
      name: 'Alex Morgan',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  },
  isPending: false,
  error: null,
};

const mockAuthClient = {
  useSession: () => MOCK_SESSION,
  signOut: async () => {
    if (typeof window !== 'undefined') window.location.href = '/login';
  },
  signIn: {
    email: async (_: { email: string; password: string; callbackURL?: string }) =>
      ({ data: MOCK_SESSION.data, error: null }),
    social: async (_: { provider: string; callbackURL?: string }) =>
      ({ data: MOCK_SESSION.data, error: null }),
  },
  signUp: {
    email: async (_: { email: string; password: string; name?: string; callbackURL?: string }) =>
      ({ data: MOCK_SESSION.data, error: null }),
  },
};

const realAuthClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000',
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const authClient: any = USE_MOCKS ? mockAuthClient : realAuthClient;
