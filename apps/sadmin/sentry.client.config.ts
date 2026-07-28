import * as Sentry from '@sentry/nextjs';
// Narrow import to avoid pulling @jobportal/db's Prisma client (node:
// APIs only) into the browser bundle.
import { scrubSentryEvent } from '@jobportal/observability/scrub';

// Phase 1 item 18 — Sentry browser-side init for apps/sadmin. Same shape as
// apps/web and apps/recruiter (see web's sentry.client.config.ts for the full
// rationale). No PostHog here: product analytics on an internal staff console
// would measure our own employees, not users.
//
// This file (plus instrumentation.ts and the server/edge configs beside it) is
// what makes global-error.tsx's captureException actually report. withSentryConfig
// in next.config.ts is build-time only — sourcemaps and tunnelling — so without
// an init the portal looks instrumented while dropping every event.

const DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;
const TRACES_SAMPLE_RATE = Number(
  process.env.SENTRY_TRACES_SAMPLE_RATE ?? '0.1',
);

if (DSN) {
  Sentry.init({
    dsn: DSN,
    tracesSampleRate: Number.isFinite(TRACES_SAMPLE_RATE) ? TRACES_SAMPLE_RATE : 0.1,
    environment: process.env.NODE_ENV ?? 'development',
    release: process.env.NEXT_PUBLIC_SENTRY_RELEASE,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    sendDefaultPii: false,
    beforeSend(event) {
      return scrubSentryEvent(event as Parameters<typeof scrubSentryEvent>[0]) as typeof event;
    },
  });
}
