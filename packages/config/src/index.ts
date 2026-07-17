import { fileURLToPath } from 'url';
import path from 'path';
import { config } from 'dotenv';
import { z } from 'zod';

// Resolve .env from monorepo root regardless of which app's CWD
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
config({ path: path.resolve(__dirname, '../../../.env') });

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  API_PORT: z.coerce.number().int().positive().default(4000),
  API_HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  CORS_ORIGIN: z.string().default('http://localhost:3000'),

  DATABASE_URL: z.string().url().optional(),
  DIRECT_URL: z.string().url().optional(),
  REDIS_URL: z.string().url().optional(),

  AUTH_SECRET: z.string().default('dev-secret-change-in-production'),
  AUTH_URL: z.string().url().default('http://localhost:4000'),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),

  // ── Transactional email (Resend) ─────────────────────────────────────────
  // When RESEND_API_KEY is absent (typical in local dev) the email layer logs
  // OTP codes to the server console instead of sending, so the full verify
  // flow is testable without a real Resend account.
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default('TRADElogs <onboarding@resend.dev>'),
  // Where "verify your email" links/buttons point the user (the web app).
  APP_URL: z.string().url().default('http://localhost:3000'),

  CREDENTIAL_ENCRYPTION_KEY: z.string().optional(),

  MT5_BRIDGE_URL: z.string().url().default('http://localhost:8000'),
  MT5_BRIDGE_SHARED_SECRET: z.string().default('dev-secret-change-in-production'),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
    throw new Error('Invalid environment configuration');
  }
  return parsed.data;
}

export const env: Env = loadEnv();
