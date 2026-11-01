/**
 * Structured logging via winston.
 *
 * Rule: no console.log in feature code — use this logger. Never log credentials,
 * passwords or raw deal dumps. As a backstop every line goes through `redact`
 * (Z4): fields named like secrets are masked, and secret-shaped strings (bearer
 * tokens, API keys, bot tokens, webhook URLs, encrypted values, passwords in
 * URLs) are masked wherever they appear, stack traces included.
 */
import winston from 'winston';

const { combine, timestamp, json, colorize, printf, errors } = winston.format;

const MASK = '[redacted]';

/** Field names whose values are never written, at any depth. */
const SECRET_FIELD = /^(password|passwd|investorpassword|secret|apisecret|api_secret|apikey|api_key|api-key|apikeyenc|apisecretenc|passphrase|passphraseenc|secrethash|token|accesstoken|refreshtoken|idtoken|bottoken|authorization|cookie|set-cookie|signature|privatekey|private_key|credentials|creds|otp|code_verifier)$/i;

/** Secret-shaped text, masked wherever it appears in a string. */
const SECRET_TEXT: Array<[RegExp, string]> = [
  [/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, `$1 ${MASK}`],
  [/\btl_[A-Za-z0-9]{4,}_[A-Za-z0-9_-]{8,}/g, `tl_${MASK}`], // our API keys (D16)
  [/\b(sk-ant-|sk-|gsk_|xai-)[A-Za-z0-9_-]{16,}/g, `$1${MASK}`], // AI provider keys
  [/\bbot\d{5,}:[A-Za-z0-9_-]{20,}/g, `bot${MASK}`], // Telegram bot token in a URL
  [/(\/hooks\/tv\/)[A-Za-z0-9_-]{10,64}/g, `$1${MASK}`], // TradingView webhook URL token
  [/\benc:v1:[A-Za-z0-9._-]+/g, `enc:v1:${MASK}`], // encrypted credential
  [/\b([a-z][a-z0-9+.-]*:\/\/[^:\s/@]+:)[^@\s]+@/gi, `$1${MASK}@`], // password in a connection URL
  // `password: "…"`, `"apiSecret":"…"`, `token='…'` inside messages (Prisma errors print their arguments).
  [/\b(password|apiSecret|api_secret|apiKey|api_key|secret|passphrase|token|authorization|signature|apiKeyEnc|apiSecretEnc)(["']?\s*[:=]\s*)(["'])(?:(?!\3).){1,500}\3/gi, `$1$2$3${MASK}$3`],
  [/([?&](?:token|key|secret|password|signature|api_key|apikey)=)[^&\s"']+/gi, `$1${MASK}`],
];

// Credentials this process has handled (decrypted or just received), masked by
// value wherever they turn up: a raw key in some library's error message has no
// shape a pattern could catch. Bounded; the oldest are forgotten first.
const known = new Set<string>();
const KNOWN_MAX = 5000;

/** Mask these exact values in every later log line (values under 8 characters are ignored). */
export function registerSecret(...values: Array<string | null | undefined>): void {
  for (const v of values) {
    if (!v || v.length < 8 || known.has(v)) continue;
    known.add(v);
    if (known.size > KNOWN_MAX) known.delete(known.values().next().value!);
  }
}

export function redactText(s: string): string {
  let out = s;
  if (out.length >= 8) for (const k of known) if (out.includes(k)) out = out.split(k).join(MASK);
  for (const [re, to] of SECRET_TEXT) out = out.replace(re, to);
  return out;
}

/** A copy of `value` with secrets masked. Cycles and very deep values are cut off. */
export function redact(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
  if (typeof value === 'string') return redactText(value);
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return '[circular]';
  if (depth > 8) return '[deep]';
  seen.add(value);
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1, seen));
  if (value instanceof Error) {
    const e: Record<string, unknown> = { name: value.name, message: redactText(value.message), stack: value.stack ? redactText(value.stack) : undefined };
    for (const [k, v] of Object.entries(value)) e[k] = SECRET_FIELD.test(k) ? MASK : redact(v, depth + 1, seen);
    return e;
  }
  if (value instanceof Date || Buffer.isBuffer(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) out[k] = SECRET_FIELD.test(k) && v != null && v !== '' ? MASK : redact(v, depth + 1, seen);
  return out;
}

/** Winston format: masks the message and every field, in place (winston's own symbols are kept). */
const redactFormat = winston.format((info) => {
  for (const k of Object.keys(info)) {
    if (k === 'level' || k === 'timestamp') continue;
    info[k] = SECRET_FIELD.test(k) ? MASK : redact(info[k]);
  }
  return info;
});

const devFormat = combine(
  errors({ stack: true }),
  redactFormat(),
  colorize(),
  timestamp({ format: 'HH:mm:ss' }),
  printf(({ level, message, timestamp: ts, ...meta }) => {
    const rest = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `${ts} ${level} ${message}${rest}`;
  }),
);

const prodFormat = combine(errors({ stack: true }), redactFormat(), timestamp(), json());

export function createLogger(level = 'info', pretty = true): winston.Logger {
  return winston.createLogger({
    level,
    format: pretty ? devFormat : prodFormat,
    transports: [new winston.transports.Console()],
  });
}

export const logger = createLogger(
  process.env.LOG_LEVEL ?? 'info',
  process.env.NODE_ENV !== 'production',
);

export type Logger = winston.Logger;
