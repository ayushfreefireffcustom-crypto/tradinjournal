import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { prisma } from '@tradinjournal/db';
import { env } from '@tradinjournal/config';

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: 'postgresql',
  }),

  secret: env.AUTH_SECRET,
  baseURL: env.AUTH_URL,
  trustedOrigins: [env.CORS_ORIGIN],

  // ── Email + password ───────────────────────────────────────────────────────
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },

  // ── Google OAuth ───────────────────────────────────────────────────────────
  // Activated only when credentials are present in .env.
  // Callback URL (register this in Google Cloud Console):
  //   {AUTH_URL}/api/auth/callback/google
  socialProviders: {
    ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: env.GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
          },
        }
      : {}),
  },

  // ── Session ────────────────────────────────────────────────────────────────
  session: {
    expiresIn: 60 * 60 * 24 * 7,   // 7 days
    updateAge: 60 * 60 * 24,        // refresh cookie if older than 1 day
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5,               // re-validate session every 5 min
    },
  },

  // Web (tradinjournalweb-*.up.railway.app) and API (tradinjournalapi-*.up.railway.app)
  // are on different registrable domains — up.railway.app is a public suffix — so the
  // session cookie must be SameSite=None to survive this cross-site fetch.
  advanced: {
    defaultCookieAttributes: {
      sameSite: 'none',
      secure: true,
    },
  },
});

export type Auth = typeof auth;
export type Session = typeof auth.$Infer.Session;
export type SessionUser = typeof auth.$Infer.Session.user;
