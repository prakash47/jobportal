import { defineConfig } from 'vitest/config';

// First test harness in apps/recruiter. Scoped to lib/** — the app's pure,
// framework-free logic — mirroring apps/web's config so `pnpm test` behaves the
// same in both Next apps. Component/RSC rendering is deliberately out of scope:
// it would need jsdom plus a React testing stack, and the recruiter surfaces are
// verified in a real browser instead.
export default defineConfig({
  test: {
    include: ['lib/**/*.test.ts', 'lib/**/*.test.tsx'],
    environment: 'node',
  },
});
