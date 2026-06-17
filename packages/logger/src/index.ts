/**
 * Structured logging via winston.
 *
 * Rule: no console.log in feature code — use this logger. Never log credentials,
 * passwords or raw deal dumps.
 */
import winston from 'winston';

const { combine, timestamp, json, colorize, printf, errors } = winston.format;

const devFormat = combine(
  colorize(),
  timestamp({ format: 'HH:mm:ss' }),
  errors({ stack: true }),
  printf(({ level, message, timestamp: ts, ...meta }) => {
    const rest = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `${ts} ${level} ${message}${rest}`;
  }),
);

const prodFormat = combine(timestamp(), errors({ stack: true }), json());

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
