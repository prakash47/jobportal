import { defineConfig } from 'vitest/config';

// First test harness in packages/ui. Scoped to src/lib/** — the package's
// pure, framework-free logic (the nav-progress state machine + click
// predicate). Component rendering is deliberately out of scope: it would need
// jsdom plus a React testing stack, and the loader surfaces are verified in a
// real browser instead (mirrors the apps/recruiter harness decision).
export default defineConfig({
  test: {
    include: ['src/lib/**/*.test.ts'],
    environment: 'node',
  },
});
