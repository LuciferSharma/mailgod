import { describe, it, expect } from 'vitest';
import mongoose from 'mongoose';

describe('test harness', () => {
  it('connects to an in-memory mongo and round-trips a doc', async () => {
    expect(mongoose.connection.readyState).toBe(1);
    const col = mongoose.connection.collection('smoke');
    await col.insertOne({ x: 1 });
    expect(await col.countDocuments()).toBe(1);
  });
});
