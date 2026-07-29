import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // The sequence suite talks to a local Postgres when DATABASE_URL points at
    // one (it skips otherwise), so allow more headroom than a pure unit suite.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
