import { config } from '../config';
import { RateWindow } from '../models/rateWindow';

const WINDOW_MS = 3_600_000; // 1 hour

/**
 * Global send-rate limiter, shared across all app instances via a Mongo counter
 * (one doc per hour window). `reserve()` is the authoritative, atomic gate used
 * right before each SendGrid call. `canSend()` is a cheap, non-authoritative
 * read used for coarse backpressure (e.g. the campaign batch loop).
 *
 * Resilience: if the DB op ever fails we FAIL OPEN, falling back to an in-process
 * counter — a counter glitch must never halt all email. The per-subscriber
 * frequency cap and SendGrid's own limits remain as backstops.
 */
class RateLimiter {
  private memWindow = -1;
  private memCount = 0;

  private windowKey(now = Date.now()): number {
    return Math.floor(now / WINDOW_MS);
  }

  private bumpMemory(key: number): number {
    if (this.memWindow !== key) {
      this.memWindow = key;
      this.memCount = 0;
    }
    return ++this.memCount;
  }

  /** Atomically reserve one global slot for the current window. */
  async reserve(): Promise<boolean> {
    const key = this.windowKey();
    try {
      const doc = await RateWindow.findOneAndUpdate(
        { _id: `global:${key}` },
        { $inc: { count: 1 }, $setOnInsert: { expireAt: new Date((key + 2) * WINDOW_MS) } },
        { upsert: true, new: true },
      ).lean();
      return (doc?.count ?? 1) <= config.globalRateLimit;
    } catch (err) {
      console.error('[rateLimiter] reserve fell back to in-memory:', (err as Error).message);
      return this.bumpMemory(key) <= config.globalRateLimit;
    }
  }

  /**
   * Release a slot reserved by reserve() when the send doesn't actually go out
   * (SendGrid threw, or the attempt was denied). Keeps the hourly counter from
   * permanently ratcheting up on failures. Best-effort, guarded against going
   * below zero; mirrors releaseFrequencySlot in emailService.
   */
  async release(): Promise<void> {
    const key = this.windowKey();
    try {
      await RateWindow.updateOne(
        { _id: `global:${key}`, count: { $gt: 0 } },
        { $inc: { count: -1 } },
      );
    } catch {
      if (this.memWindow === key && this.memCount > 0) this.memCount--;
    }
  }

  /** Read-only check (no reservation) for coarse backpressure. */
  async canSend(): Promise<boolean> {
    const key = this.windowKey();
    try {
      const doc = await RateWindow.findById(`global:${key}`).lean();
      return (doc?.count ?? 0) < config.globalRateLimit;
    } catch {
      return this.memCount < config.globalRateLimit;
    }
  }

  async getStats() {
    const key = this.windowKey();
    let sent = this.memCount;
    try {
      const doc = await RateWindow.findById(`global:${key}`).lean();
      sent = doc?.count ?? 0;
    } catch {
      /* use in-memory fallback */
    }
    return {
      sent_this_hour: sent,
      limit: config.globalRateLimit,
      remaining: Math.max(0, config.globalRateLimit - sent),
    };
  }
}

export const rateLimiter = new RateLimiter();
