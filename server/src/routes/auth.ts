import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { config } from '../config';

const router = Router();

// Constant-time password comparison (hash first so lengths always match).
function passwordMatches(input: unknown): boolean {
  if (typeof input !== 'string' || !input) return false;
  const a = crypto.createHash('sha256').update(input).digest();
  const b = crypto.createHash('sha256').update(config.adminPassword).digest();
  return crypto.timingSafeEqual(a, b);
}

// Naive in-memory brute-force throttle: 10 failed attempts per IP per 15 min.
const failures = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 10;

router.post('/login', (req: Request, res: Response, next: Function) => {
  try {
    const ip = req.ip || 'unknown';
    const now = Date.now();
    const f = failures.get(ip);
    if (f && f.resetAt > now && f.count >= MAX_FAILURES) {
      return res.status(429).json({ error: 'Too many failed attempts. Try again later.' });
    }

    const { password } = req.body;

    if (!passwordMatches(password)) {
      const cur = f && f.resetAt > now ? f : { count: 0, resetAt: now + WINDOW_MS };
      cur.count++;
      failures.set(ip, cur);
      return res.status(401).json({ error: 'Invalid password' });
    }
    failures.delete(ip);

    const token = jwt.sign(
      { role: 'admin' },
      config.jwtSecret,
      { expiresIn: '7d' }
    );

    res.json({ token });
  } catch (error) {
    next(error);
  }
});

export { router as authRoutes };
