/**
 * Centralised, validated configuration.
 *
 * Rule: feature code NEVER reads process.env directly — it imports `env` from here.
 * The schema is validated once at boot; the app crashes fast on missing/invalid config.
 */
import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  API_PORT: z.coerce.number().int().positive().default(4000),
  API_HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  DATABASE_URL: z.string().url().optional(),
  REDIS_URL: z.string().url().optional(),

  AUTH_SECRET: z.string().optional(),
  AUTH_URL: z.string().url().optional(),

  CREDENTIAL_ENCRYPTION_KEY: z.string().optional(),

  MT5_BRIDGE_URL: z.string().url().optional(),
  MT5_BRIDGE_SHARED_SECRET: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
    throw new Error('Invalid environment configuration');
  }
  return parsed.data;
}

export const env: Env = loadEnv();
