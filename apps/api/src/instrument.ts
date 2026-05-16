// Phase 1 item 18 — Sentry initialisation. MUST be imported BEFORE
// anything else in main.ts so the SDK has a chance to patch http /
// fetch / pg / ioredis before AppModule's transitive imports pull them
// in. If you reorder this and AppModule comes first, traces silently
// stop working.
//
// Blank DSN → SDK is a no-op (per @sentry/node docs). Local dev runs
// without a DSN; staging/prod set SENTRY_DSN in their env.

import * as Sentry from '@sentry/nestjs';
import { scrubSentryEvent } from '@jobportal/observability';

const DSN = process.env.SENTRY_DSN;
const TRACES_SAMPLE_RATE = Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? '0.1');

if (DSN) {
  Sentry.init({
    dsn: DSN,
    // Errors are always captured (sampleRate=1 implicit). Performance
    // traces are sampled at 10% in prod by default; raise via env when
    // debugging a specific perf issue.
    tracesSampleRate: Number.isFinite(TRACES_SAMPLE_RATE) ? TRACES_SAMPLE_RATE : 0.1,
    environment: process.env.NODE_ENV ?? 'development',
    release: process.env.SENTRY_RELEASE,
    // We send user.id/email/role through setUser() in the JWT guard
    // chain — never via Sentry's auto-PII capture, which would pull
    // headers / cookies and risk leaking the access token.
    sendDefaultPii: false,
    beforeSend(event) {
      // killswitch.telemetry can't be checked synchronously here (the
      // flag system is async) so the runtime gate lives in the
      // exception filter where we DO have async context. beforeSend
      // is the second line of defence: scrub PII from anything the SDK
      // auto-captured before it leaves the process.
      return scrubSentryEvent(event);
    },
  });
}
