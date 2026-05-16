// Phase 1 item 18 — Next.js 16 instrumentation hook. Called once at
// server boot and once for the edge runtime. We delegate to the
// per-runtime sentry config files so each only loads the SDK chunks
// it needs.

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

// Export the request-error hook so Next.js auto-captures RSC errors
// that bubble past route boundaries. Without this, server-rendered
// errors don't show up in Sentry at all. The @sentry/nextjs SDK
// exports the implementation as `captureRequestError`; Next.js looks
// up the hook under the name `onRequestError`, so we re-export with a
// rename.
export { captureRequestError as onRequestError } from '@sentry/nextjs';
