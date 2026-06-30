'use client';

// Local mock auth — preview environment has no Express auth backend.
// Always returns a signed-in test user so the dashboard, analytics and chart
// pages are reachable without going through a real login flow.

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

export const authClient = {
  useSession: () => MOCK_SESSION,
  signOut: async () => {
    if (typeof window !== 'undefined') window.location.href = '/login';
  },
  signIn: {
    email: async (_: { email: string; password: string }) => ({ data: MOCK_SESSION.data, error: null }),
  },
  signUp: {
    email: async (_: { email: string; password: string; name?: string }) => ({ data: MOCK_SESSION.data, error: null }),
  },
};
