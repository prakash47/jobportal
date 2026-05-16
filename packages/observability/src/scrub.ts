// Phase 1 item 18 — PII / token scrubbing for Sentry breadcrumbs +
// PostHog event payloads. Mirrors the redaction discipline already in
// place for email-stub console logging (apps/api/src/email/resend-
// client.ts comment): tokens in query strings must NEVER reach external
// telemetry sinks where they can be mined by anyone with read access to
// the Sentry/PostHog project.
//
// Matches `?token=`, `?code=`, `?confirm=`, `?nonce=`, and the same set
// preceded by `&`. The match-and-replace pattern preserves the leading
// `?` or `&` so the URL stays well-formed; only the value is masked.
const TOKEN_PARAM = /([?&])(token|code|confirm|nonce|t)=[^&\s)]+/gi;

const REDACTED = '[REDACTED]';

export function scrubUrl(url: string): string {
  if (!url) return url;
  return url.replace(TOKEN_PARAM, `$1$2=${REDACTED}`);
}

// Some error messages embed the offending URL (e.g. "fetch failed for
// /reset-password?token=abc"). Apply the same scrubber so the stack
// trace doesn't leak.
export function scrubMessage(message: string): string {
  if (!message) return message;
  return message.replace(TOKEN_PARAM, `$1$2=${REDACTED}`);
}

// Convenience helper for Sentry's `beforeSend` callback. Accepts the
// SDK's Event shape loosely (we don't depend on @sentry/types here so
// the package stays SDK-agnostic and testable without the SDK
// installed). Mutates and returns the event for chaining.
export function scrubSentryEvent<
  T extends {
    request?: { url?: string | undefined; query_string?: string | undefined };
    message?: string;
    exception?: { values?: Array<{ value?: string }> };
    breadcrumbs?: Array<{ data?: { url?: string } | undefined; message?: string | undefined }>;
  },
>(event: T): T {
  if (event.request?.url) event.request.url = scrubUrl(event.request.url);
  if (event.request?.query_string) {
    // Sentry's Node SDK emits query_string without a leading ?, but our
    // regex requires ? or & as the leading sigil. Prepend a ? so the
    // first token in a bare "token=abc&foo=bar" string is also matched,
    // then strip it back off.
    const withSigil = '?' + event.request.query_string;
    event.request.query_string = scrubUrl(withSigil).slice(1);
  }
  if (event.message) event.message = scrubMessage(event.message);
  if (event.exception?.values) {
    for (const v of event.exception.values) {
      if (v.value) v.value = scrubMessage(v.value);
    }
  }
  if (event.breadcrumbs) {
    for (const b of event.breadcrumbs) {
      if (b.data?.url) b.data.url = scrubUrl(b.data.url);
      if (b.message) b.message = scrubMessage(b.message);
    }
  }
  return event;
}
