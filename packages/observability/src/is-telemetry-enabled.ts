import { isFlagEnabled } from '@jobportal/feature-flags';

// killswitch.telemetry — boolean, default OFF (in seed). Returning the
// inverse here (telemetry-enabled when killswitch is OFF) keeps caller
// code readable: `if (await isTelemetryEnabled()) capture(...)`.
//
// Reads go through @jobportal/feature-flags which has L1 in-process LRU
// + L2 Redis cache (30s TTL each), so the killswitch check inside a
// Sentry beforeSend callback is sub-millisecond hot-path.
export async function isTelemetryEnabled(): Promise<boolean> {
  try {
    const killswitchOn = await isFlagEnabled('killswitch.telemetry');
    return !killswitchOn;
  } catch {
    // Flag lookup failure (Redis down, DB blip) defaults to telemetry
    // ENABLED — we'd rather over-capture than blind ourselves during an
    // incident. Sentry's own failure-mode is dropping events anyway.
    return true;
  }
}
