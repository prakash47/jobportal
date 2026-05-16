// Phase 1 item 18 — Sentry server-side init for apps/web (RSC + route
// handlers + middleware-adjacent code). Loaded by the Next.js
// instrumentation hook (see instrumentation.ts).

import * as Sentry from '@sentry/nextjs';
import { scrubSentryEvent } from '@jobportal/observability';

const DSN = process.env.SENTRY_DSN;
const TRACES_SAMPLE_RATE = Number(
  process.env.SENTRY_TRACES_SAMPLE_RATE ?? '0.1',
);

if (DSN) {
  Sentry.init({
    dsn: DSN,
    tracesSampleRate: Number.isFinite(TRACES_SAMPLE_RATE) ? TRACES_SAMPLE_RATE : 0.1,
    environment: process.env.NODE_ENV ?? 'development',
    release: process.env.SENTRY_RELEASE,
    sendDefaultPii: false,
    beforeSend(event) {
      return scrubSentryEvent(event as Parameters<typeof scrubSentryEvent>[0]) as typeof event;
    },
  });
}
