import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    env: { CALCOM_SECRET: 'test-calcom-secret' },
    setupFiles: ['./test/setup.ts'],
    // First run may download the in-memory mongod binary — allow time.
    hookTimeout: 180_000,
    testTimeout: 30_000,
    // Run test files serially so each owns its in-memory Mongo (no contention).
    fileParallelism: false,
  },
});
