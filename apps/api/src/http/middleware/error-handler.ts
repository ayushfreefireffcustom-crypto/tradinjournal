import type { Request, Response, NextFunction } from 'express';
import { logger } from '@tradinjournal/logger';
import { AppError, ValidationError } from '../errors.js';

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof ValidationError) {
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        ...(err.fields ? { fields: err.fields } : {}),
      },
    });
    return;
  }

  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error(err.message, { code: err.code, stack: err.stack });
    }
    res.status(err.statusCode).json({
      error: { code: err.code, message: err.message },
    });
    return;
  }

  // Unknown error — don't leak internals to client
  logger.error(err.message, { stack: err.stack });
  res.status(500).json({
    error: { code: 'INTERNAL', message: 'Internal server error' },
  });
}
