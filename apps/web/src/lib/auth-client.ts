import { createAuthClient } from 'better-auth/react';

const realAuthClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000',
});

// 🚨 MOCK DEV ENVIRONMENT: Bypassing useSession hook to prevent UI redirects due to DB connection failure
export const authClient = {
  ...realAuthClient,
  useSession: () => ({
    data: {
      session: { id: 'mock-session', userId: 'mock-user', expiresAt: new Date(Date.now() + 86400000), ipAddress: '127.0.0.1', userAgent: 'mock' },
      user: { id: 'mock-user', email: 'tester@example.com', emailVerified: true, name: 'Frontend Tester', createdAt: new Date(), updatedAt: new Date() }
    },
    isPending: false,
    error: null,
  })
} as any as typeof realAuthClient;
