import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { emailOTP } from 'better-auth/plugins';
import { prisma } from '@tradinjournal/db';
import { env } from '@tradinjournal/config';
import { logger } from '@tradinjournal/logger';
import { sendEmail } from './email/client.js';
import { verificationOtpEmail, welcomeEmail, resetPasswordEmail } from './email/templates.js';
import { geocodeUserIfNeeded } from '../modules/me/location.service.js';
import { attributeNewUser } from '../modules/partners/attribution.service.js';

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: 'postgresql',
  }),

  secret: env.AUTH_SECRET,
  baseURL: env.AUTH_URL,
  trustedOrigins: [env.CORS_ORIGIN, env.APP_URL],

  user: {
    additionalFields: {
      country: { type: 'string', required: false, input: true },
      city: { type: 'string', required: false, input: true },
      postalCode: { type: 'string', required: false, input: true },
      lat: { type: 'number', required: false, input: false },
      lng: { type: 'number', required: false, input: false },
      locationUpdatedAt: { type: 'date', required: false, input: false },
      // Partner code typed at signup; attribution happens in the create hook below.
      referralCode: { type: 'string', required: false, input: true },
    },
  },

  databaseHooks: {
    user: {
      create: {
        after: async (user, ctx) => {
          // Lock the referral now — a typed code beats an earlier link click
          // (tl_ref cookie, sent along on both email signup and the OAuth callback).
          await attributeNewUser(
            { id: user.id, referralCode: (user as { referralCode?: string | null }).referralCode ?? null },
            ctx?.headers?.get('cookie') ?? ctx?.request?.headers.get('cookie') ?? null,
          );
          // Best-effort geocode when signup included location fields.
          void geocodeUserIfNeeded(user.id).catch(err => {
            logger.warn('[auth] post-signup geocode failed', { userId: user.id, err });
          });
        },
      },
    },
  },

  // ── Email + password ───────────────────────────────────────────────────────
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
  },

  emailVerification: {
    autoSignInAfterVerification: true,
    afterEmailVerification: async (user) => {
      try {
        const { subject, html } = welcomeEmail(user.name ?? '');
        await sendEmail({ to: user.email, subject, html });
      } catch (err) {
        logger.error('Failed to send welcome email', { userId: user.id, err });
      }
    },
  },

  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ['google'],
    },
  },

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

  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5,
    },
  },

  advanced: {
    defaultCookieAttributes: {
      sameSite: 'none',
      secure: true,
    },
  },

  plugins: [
    emailOTP({
      otpLength: 6,
      expiresIn: 60 * 10,
      sendVerificationOnSignUp: true,
      async sendVerificationOTP({ email, otp, type }) {
        if (type === 'email-verification') {
          const { subject, html } = verificationOtpEmail(otp);
          await sendEmail({ to: email, subject, html, devNote: `Verify OTP for ${email}: ${otp}` });
        } else if (type === 'forget-password') {
          const { subject, html } = resetPasswordEmail(otp);
          await sendEmail({ to: email, subject, html, devNote: `Reset OTP for ${email}: ${otp}` });
        }
      },
    }),
  ],
});

export type Auth = typeof auth;
export type Session = typeof auth.$Infer.Session;
export type SessionUser = typeof auth.$Infer.Session.user;
