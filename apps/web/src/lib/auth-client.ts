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
import { emailOTPClient } from 'better-auth/client/plugins';
import { resetUserCaches } from '@/lib/session-caches';

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
      email: 'trader@tradelogs.io',
      emailVerified: true,
      name: 'Alex Morgan',
      country: 'US',
      city: 'New York',
      postalCode: '10001',
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
  // Email-OTP verification — mock always "succeeds" so preview mode isn't gated.
  emailOtp: {
    sendVerificationOtp: async (_: { email: string; type: string }) => ({ data: {}, error: null }),
    verifyEmail: async (_: { email: string; otp: string }) =>
      ({ data: MOCK_SESSION.data, error: null }),
    requestPasswordReset: async (_: { email: string }) => ({ data: {}, error: null }),
    resetPassword: async (_: { email: string; otp: string; password: string }) =>
      ({ data: {}, error: null }),
  },
};

const realAuthClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_API_URL || '',
  plugins: [emailOTPClient()],
});

// Signing out also drops the per-user caches (broker list, access/role flags).
// The better-auth client is a Proxy, so wrap rather than spread it.
const withCacheReset = new Proxy(realAuthClient, {
  get(target, key, recv) {
    if (key === 'signOut') {
      return async (...args: Parameters<typeof realAuthClient.signOut>) => {
        resetUserCaches();
        return realAuthClient.signOut(...args);
      };
    }
    return Reflect.get(target, key, recv);
  },
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const authClient: any = USE_MOCKS ? mockAuthClient : withCacheReset;
