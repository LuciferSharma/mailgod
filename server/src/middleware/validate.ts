import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AppError } from '../utils/AppError';

export function validate(schema: z.ZodType) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const details = result.error.issues.map((issue: z.ZodIssue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      }));
      return next(AppError.validation('Validation failed', details));
    }
    req.body = result.data;
    next();
  };
}
