import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';

declare global {
  namespace Express {
    interface Request {
      user?: { role: string };
    }
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required', code: 'UNAUTHORIZED' });
  }

  const token = header.slice(7);
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as any;
    req.user = { role: decoded.role || 'admin' };
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token', code: 'UNAUTHORIZED' });
  }
}
