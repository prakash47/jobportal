import * as Sentry from '@sentry/nextjs';
import { scrubSentryEvent } from '@jobportal/observability';

// Phase 1 item 18 — Sentry browser-side init for apps/recruiter. Same
// shape as apps/web (see web's sentry.client.config.ts for the full
// rationale). Recruiter doesn't have PostHog wired — B2B funnel
// analytics deferred to Phase 2.

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
