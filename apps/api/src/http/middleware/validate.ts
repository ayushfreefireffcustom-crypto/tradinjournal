import type { Request, Response, NextFunction } from 'express';
import type { ZodSchema } from 'zod';

export function validateBody(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(422).json({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid request body', details: result.error.flatten().fieldErrors },
      });
      return;
    }
    req.body = result.data;
    next();
  };
}

export function validateQuery(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      res.status(422).json({
        error: { code: 'VALIDATION_ERROR', message: 'Invalid query params', details: result.error.flatten().fieldErrors },
      });
      return;
    }
    req.query = result.data as Record<string, string>;
    next();
  };
}
