import { beforeAll, afterAll, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
});

// Wipe data between tests for isolation (keeps indexes).
afterEach(async () => {
  for (const c of Object.values(mongoose.connection.collections)) {
    await c.deleteMany({});
  }
});

afterAll(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});
