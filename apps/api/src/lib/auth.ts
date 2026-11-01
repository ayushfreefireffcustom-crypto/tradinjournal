import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { emailOTP, twoFactor } from 'better-auth/plugins';
import { prisma } from '@tradinjournal/db';
import { env } from '@tradinjournal/config';
import { logger } from '@tradinjournal/logger';
import { sendEmail } from './email/client.js';
import { verificationOtpEmail, welcomeEmail, resetPasswordEmail } from './email/templates.js';
import { geocodeUserIfNeeded } from '../modules/me/location.service.js';
import { attributeNewUser } from '../modules/partners/attribution.service.js';
import { recordActivity } from '../modules/me/activity.service.js';

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
    // Activity log (H7): one line per sign-in, with the device it came from.
    session: {
      create: {
        after: async (session, ctx) => {
          // Only real sign-ins: sessions are also re-issued when the password or
          // two-factor setting changes, and those aren't new sign-ins.
          const path = ctx?.path ?? '';
          const signedIn = !!ctx?.context?.session;
          const kind = path === '/sign-in/email' ? 'password'
            : path.startsWith('/callback/') || path === '/sign-in/social' ? 'google'
            : path === '/email-otp/verify-email' ? 'verify'
            : path === '/sign-in/email-otp' ? 'email-code'
            : (path === '/two-factor/verify-totp' || path === '/two-factor/verify-otp') && !signedIn ? 'totp'
            : path === '/two-factor/verify-backup-code' && !signedIn ? 'backup'
            : null;
          if (!kind) return;
          // A password sign-in by someone with two-factor on makes a session the
          // plugin throws away; the real sign-in is logged when the code checks out.
          if (kind === 'password') {
            const u = await prisma.user.findUnique({ where: { id: session.userId }, select: { twoFactorEnabled: true } });
            if (u?.twoFactorEnabled) return;
          }
          const how = { password: 'with a password', google: 'with Google', verify: 'after confirming the email', 'email-code': 'with an emailed code', totp: 'with a two-factor code', backup: 'with a backup code' }[kind];
          await recordActivity(session.userId, 'sign_in', `Signed in ${how}`, { ip: session.ipAddress, userAgent: session.userAgent });
        },
      },
    },
    user: {
      update: {
        before: async (data, ctx) => {
          const userId = ctx?.context?.session?.user?.id;
          if (userId && 'twoFactorEnabled' in data && typeof data.twoFactorEnabled === 'boolean') {
            await recordActivity(userId, data.twoFactorEnabled ? 'two_factor_on' : 'two_factor_off', data.twoFactorEnabled ? 'Turned on two-factor sign-in' : 'Turned off two-factor sign-in', { ip: ctx?.context?.session?.session?.ipAddress, userAgent: ctx?.request?.headers.get('user-agent') });
          }
          return { data };
        },
      },
      create: {
        after: async (user, ctx) => {
          // Lock the referral now — a typed code beats an earlier link click
          // (tl_ref cookie, sent along on both email signup and the OAuth callback).
          if (env.PARTNER_PROGRAM_ENABLED) await attributeNewUser(
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

  // Security events that change nothing in the user row (H7).
  hooks: {
    after: createAuthMiddleware(async (ctx) => {
      const userId = ctx.context.session?.user?.id;
      // Only what actually happened: a refused change (wrong password) isn't logged.
      if (!userId || ctx.context.returned instanceof APIError) return;
      const meta = { ip: ctx.request?.headers.get('x-forwarded-for')?.split(',').at(-1)?.trim() ?? null, userAgent: ctx.request?.headers.get('user-agent') ?? null };
      if (ctx.path === '/change-password') await recordActivity(userId, 'password_changed', 'Changed the password', meta);
      else if (ctx.path === '/revoke-other-sessions') await recordActivity(userId, 'sessions_revoked', 'Signed out every other device', meta);
      else if (ctx.path === '/revoke-session') await recordActivity(userId, 'sessions_revoked', 'Signed out one device', meta);
      else if (ctx.path === '/two-factor/generate-backup-codes') await recordActivity(userId, 'backup_codes_new', 'Made new backup codes (the old ones stopped working)', meta);
    }),
  },

  plugins: [
    // H5: authenticator-app codes with ten single-use backup codes. Only email+password
    // sign-ins are challenged; Google sign-ins rely on Google's own two-step check.
    twoFactor({ issuer: 'TRADElogs', backupCodeOptions: { amount: 10, length: 10 } }),
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
