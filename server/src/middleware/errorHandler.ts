import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/AppError';

export function errorHandler(err: any, req: Request, res: Response, _next: NextFunction) {
  // AppError (our own errors)
  if (err instanceof AppError) {
    const body: any = { error: err.message, code: err.code, requestId: req.id };
    if ((err as any).details) body.details = (err as any).details;
    return res.status(err.statusCode).json(body);
  }

  // Mongoose ValidationError
  if (err.name === 'ValidationError' && err.errors) {
    const details: Record<string, string> = {};
    for (const [field, e] of Object.entries(err.errors) as any) {
      details[field] = e.message;
    }
    return res.status(400).json({
      error: 'Validation failed',
      code: 'VALIDATION_ERROR',
      details,
      requestId: req.id,
    });
  }

  // Mongoose CastError (invalid ObjectId)
  if (err.name === 'CastError' && err.kind === 'ObjectId') {
    return res.status(400).json({
      error: `Invalid ID: ${err.value}`,
      code: 'INVALID_ID',
      requestId: req.id,
    });
  }

  // MongoDB duplicate key
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern || {})[0] || 'unknown';
    return res.status(409).json({
      error: `Duplicate value for ${field}`,
      code: 'DUPLICATE_KEY',
      requestId: req.id,
    });
  }

  // Fallback
  console.error(`[${req.id}] Unhandled error:`, err);
  res.status(500).json({
    error: 'Internal server error',
    code: 'INTERNAL_ERROR',
    requestId: req.id,
  });
}

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    error: `Route ${req.method} ${req.originalUrl} not found`,
    code: 'ROUTE_NOT_FOUND',
    requestId: req.id,
  });
}
