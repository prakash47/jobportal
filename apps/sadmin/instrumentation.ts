import { assertServerEnv } from './lib/env';

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Before Sentry, so a portal that cannot authenticate anyone says so on the
    // first line of the terminal rather than serving a login form that silently
    // rejects every correct password. See lib/env.ts for the full story.
    //
    // Guarded to the nodejs runtime on purpose. middleware.ts runs on the EDGE
    // runtime, which is not guaranteed to receive server-only vars — asserting
    // in the edge branch below would break middleware on a correctly configured
    // machine. Skipped during `next build` too: the build compiles pages and
    // never serves a request, so failing it would block a teammate from building
    // the repo for a variable only the running server needs.
    if (process.env.NEXT_PHASE !== 'phase-production-build') {
      assertServerEnv();
    }
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

export { captureRequestError as onRequestError } from '@sentry/nextjs';
