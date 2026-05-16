// @jobportal/observability — shared Sentry + PostHog helpers (Phase 1
// item 18). The SDKs themselves are installed per-app since their
// runtimes differ (NestJS for the API, Next.js for the three frontends),
// but the scrubbers and the killswitch check are app-agnostic and live
// here.

export { scrubMessage, scrubSentryEvent, scrubUrl } from './scrub';
export { isTelemetryEnabled } from './is-telemetry-enabled';
