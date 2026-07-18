import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { emailOTP } from 'better-auth/plugins';
import { prisma } from '@tradinjournal/db';
import { env } from '@tradinjournal/config';
import { logger } from '@tradinjournal/logger';
import { sendEmail } from './email/client.js';
import { verificationOtpEmail, welcomeEmail, resetPasswordEmail } from './email/templates.js';

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: 'postgresql',
  }),

  secret: env.AUTH_SECRET,
  baseURL: env.AUTH_URL,
  trustedOrigins: [env.CORS_ORIGIN, env.APP_URL],

  // ── Email + password ───────────────────────────────────────────────────────
  // Password sign-ups must verify their email (via the OTP plugin below) before
  // they can sign in. OAuth users skip this — their provider already verified
  // the address.
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
  },

  // ── Email verification lifecycle ─────────────────────────────────────────────
  // Fired by the emailOTP verify-email route once the code checks out. We use it
  // to send a one-time welcome email. autoSignInAfterVerification creates a
  // session on successful OTP verify so the user lands straight on /dashboard
  // instead of bouncing to /login to enter their password again.
  emailVerification: {
    autoSignInAfterVerification: true,
    afterEmailVerification: async (user) => {
      try {
        const { subject, html } = welcomeEmail(user.name ?? '');
        await sendEmail({ to: user.email, subject, html });
      } catch (err) {
        // Never let a welcome-email failure break the verify flow.
        logger.error('Failed to send welcome email', { userId: user.id, err });
      }
    },
  },

  // ── Account linking ──────────────────────────────────────────────────────────
  // If someone signed up with email+password and later signs in with Google
  // (same address), link the Google identity to the existing account instead of
  // erroring with `account_not_linked`. Safe because Google is a verified-email
  // provider, so it proves ownership of the address.
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ['google'],
    },
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

  // The web app (www.tradelogs.com) fetches the API (api.tradelogs.com) with
  // credentials. Even though they share the tradelogs.com registrable domain,
  // browsers treat different subdomains as cross-site for cookies, so the session
  // cookie must be SameSite=None; Secure to be sent on that cross-subdomain fetch.
  // (Secure cookies are also allowed on http://localhost, so local dev works too.)
  advanced: {
    defaultCookieAttributes: {
      sameSite: 'none',
      secure: true,
    },
  },

  // ── Plugins ──────────────────────────────────────────────────────────────────
  // Email OTP: on sign-up we auto-send a 6-digit code; the user confirms it on
  // the /verify screen. Delivery goes through Resend (or the dev-console
  // fallback when RESEND_API_KEY is unset).
  plugins: [
    emailOTP({
      otpLength: 6,
      expiresIn: 60 * 10, // 10 minutes
      sendVerificationOnSignUp: true,
      async sendVerificationOTP({ email, otp, type }) {
        // Same OTP plumbing serves signup verification and password reset — pick
        // the right email for each.
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
