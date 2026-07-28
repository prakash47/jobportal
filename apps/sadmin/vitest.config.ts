import { defineConfig } from 'vitest/config';

// Scoped to lib/** — the app's pure, framework-free logic — mirroring
// apps/web and apps/recruiter so `pnpm test` behaves the same in every Next app.
// Component/RSC rendering is deliberately out of scope: it would need jsdom plus
// a React testing stack; those surfaces are verified in a real browser instead.
//
// Note: vitest exits 1 when zero files match `include` (no passWithNoTests is
// set in any workspace config), so this app must always carry at least one
// lib/**/*.test.ts or the whole `pnpm test` gate goes red.
export default defineConfig({
  test: {
    include: ['lib/**/*.test.ts', 'lib/**/*.test.tsx'],
    environment: 'node',
  },
});
