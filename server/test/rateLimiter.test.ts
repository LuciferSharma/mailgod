import { describe, it, expect, afterEach } from 'vitest';
import { rateLimiter } from '../src/utils/rateLimiter';
import { config } from '../src/config';
import { RateWindow } from '../src/models/rateWindow';

describe('rateLimiter (Mongo-backed)', () => {
  const original = config.globalRateLimit;
  afterEach(() => { config.globalRateLimit = original; });

  it('reserves slots and enforces the hourly cap', async () => {
    config.globalRateLimit = 2;
    expect(await rateLimiter.reserve()).toBe(true);  // count 1
    expect(await rateLimiter.reserve()).toBe(true);  // count 2
    expect(await rateLimiter.reserve()).toBe(false); // count 3 > 2

    const docs = await RateWindow.find().lean();
    expect(docs).toHaveLength(1);
    expect(docs[0].count).toBe(3);
  });

  it('canSend reflects remaining headroom without reserving', async () => {
    config.globalRateLimit = 1;
    expect(await rateLimiter.canSend()).toBe(true); // nothing reserved yet
    expect(await rateLimiter.reserve()).toBe(true); // count 1 == limit
    expect(await rateLimiter.canSend()).toBe(false); // 1 is not < 1
  });

  it('release() gives a reserved slot back', async () => {
    config.globalRateLimit = 5;
    await rateLimiter.reserve(); // count 1
    await rateLimiter.reserve(); // count 2
    await rateLimiter.release(); // back to 1
    const doc = await RateWindow.findOne().lean();
    expect(doc!.count).toBe(1);
  });

  it('release() never drives the counter below zero', async () => {
    await rateLimiter.release(); // no prior reservation this window
    const doc = await RateWindow.findOne().lean();
    expect(doc?.count ?? 0).toBeGreaterThanOrEqual(0);
  });
});
