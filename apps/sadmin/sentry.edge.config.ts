import * as Sentry from '@sentry/nextjs';
// Import scrub from its file path directly so the Edge runtime doesn't
// transitively pull @jobportal/feature-flags → @jobportal/db's Prisma
// client (which uses node: APIs Edge can't run).
import { scrubSentryEvent } from '@jobportal/observability/scrub';

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
