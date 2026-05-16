// Phase 1 item 18 — Sentry browser-side init for apps/web. Auto-loaded
// by @sentry/nextjs at every client render. Blank DSN → SDK no-op.

import * as Sentry from '@sentry/nextjs';
import { scrubSentryEvent } from '@jobportal/observability';

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
    // Replay is bandwidth-heavy; deferred to a follow-up if/when we
    // need it. Web Vitals capture is on by default in @sentry/nextjs
    // and stays on — that's the headline metric for SRS §5.1.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    sendDefaultPii: false,
    beforeSend(event) {
      // scrubSentryEvent is intentionally SDK-agnostic (so the helper
      // package stays testable without installing @sentry/types). The
      // structural shapes match at runtime; the cast suppresses TS's
      // exactOptionalPropertyTypes mismatch between Sentry's
      // ErrorEvent (with `| undefined` properties) and our generic
      // constraint.
      return scrubSentryEvent(event as Parameters<typeof scrubSentryEvent>[0]) as typeof event;
    },
  });
}
