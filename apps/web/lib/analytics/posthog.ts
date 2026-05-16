'use client';

import posthog, { type PostHog } from 'posthog-js';

// Phase 1 item 18 — thin PostHog wrapper for apps/web. Lazy-init on the
// first track() / identify() call so a blank NEXT_PUBLIC_POSTHOG_KEY
// is a clean no-op (matches the Resend / Sentry env shape).
//
// We deliberately disable autocapture: every click + form submit would
// be expensive at scale and the value is low when we're trying to
// measure five specific product moments. The five events live in
// EVENTS below and are emitted from existing components.

let initialised = false;

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com';

function ensureInit(): PostHog | null {
  if (!KEY || typeof window === 'undefined') return null;
  if (!initialised) {
    posthog.init(KEY, {
      api_host: HOST,
      // Five hand-picked events, not autocapture — see file comment.
      autocapture: false,
      // 'history_change' picks up Next.js App Router pushState
      // navigations as pageviews. Plain `true` only fires on hard
      // refreshes and would miss every in-app navigation.
      capture_pageview: 'history_change',
      capture_pageleave: true,
      // Session recording is bandwidth-heavy; deferred to a follow-up.
      disable_session_recording: true,
      // Don't capture the full page DOM in events — only the URL +
      // properties we hand in. SRS-level privacy.
      mask_all_text: false,
      // Default opt-in. A consent banner can flip this in Phase 2 once
      // legal review is done; for MVP we're operating under legitimate
      // interest for our own product analytics.
      opt_out_capturing_by_default: false,
    });
    initialised = true;
  }
  return posthog;
}

export const EVENTS = {
  JOB_APPLY_CLICKED: 'job_apply_clicked',
  JOB_SAVED: 'job_saved',
  JOB_UNSAVED: 'job_unsaved',
  JOB_ALERT_CREATED: 'job_alert_created',
  SEARCH_PERFORMED: 'search_performed',
  APPLICATION_WITHDRAWN: 'application_withdrawn',
} as const;

export type EventName = (typeof EVENTS)[keyof typeof EVENTS];

export function track(event: EventName, properties?: Record<string, unknown>): void {
  const client = ensureInit();
  if (!client) return;
  try {
    client.capture(event, properties);
  } catch {
    // PostHog throws on quota / network in some edge cases. Swallowing
    // here is correct — analytics must never break the product.
  }
}

export function identify(userId: number | string, traits?: Record<string, unknown>): void {
  const client = ensureInit();
  if (!client) return;
  try {
    client.identify(String(userId), traits);
  } catch {
    // Same swallow as track().
  }
}

export function reset(): void {
  // Called on sign-out so a subsequent anonymous session doesn't
  // attribute events to the prior user.
  const client = ensureInit();
  if (!client) return;
  try {
    client.reset();
  } catch {
    // ignore
  }
}
