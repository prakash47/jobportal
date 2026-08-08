// Express's `trust proxy` setting, read from the environment.
//
// WHY THIS IS NOT HARDCODED
//
// Everything that identifies a caller reads `req.ip`: the global ThrottlerGuard
// (100/min — @nestjs/throttler 6.5's default `getTracker` returns `req.ip`
// verbatim), the per-IP login throttle, and the `Session.ipAddress` /
// `OtpChallenge.ipAddress` audit columns. With `trust proxy` unset, Express
// ignores `X-Forwarded-For` entirely and `req.ip` is the socket peer. Behind a
// reverse proxy that peer is the PROXY, so all three collapse: one throttle
// bucket for the entire internet, and every audit row recording the same
// address.
//
// The tempting fix — `app.set('trust proxy', true)` — is WORSE than the bug.
// `true` tells Express to believe the whole forwarded chain, so any client can
// send its own `X-Forwarded-For` and become any address it likes. That does not
// merely fail to fix the limiter; it removes it, because an attacker rotates
// the header and never shares a bucket with itself. It also lets an attacker
// write arbitrary values into the audit columns.
//
// The correct value is a property of the DEPLOYMENT, not of the code: it is the
// number of proxies that actually sit in front of this process (1 for Render or
// Fly alone, 2 with Cloudflare in front of one of them), or an explicit list of
// trusted proxy addresses. Nothing is deployed yet, so guessing here would bake
// in a number that is silently wrong the first time the topology changes.
//
// Hence: configured per environment, defaulting to Express's own `false`, which
// is byte-for-byte today's behaviour. Local development is unaffected.

/** Values Express accepts for the `trust proxy` setting that we support here. */
export type TrustProxySetting = boolean | number | string;

/**
 * Parse the `TRUST_PROXY` env var into an Express `trust proxy` value.
 *
 * - unset / empty / whitespace → `false` (Express's default; ignore
 *   `X-Forwarded-For` and use the socket peer)
 * - `"false"` / `"0"` / `"off"` / `"no"` → `false`
 * - `"true"` / `"on"` / `"yes"` → `true` — trusts the ENTIRE chain and is
 *   therefore spoofable. Supported because it is genuinely what you want behind
 *   a proxy you fully control on a private network, but `warnIfUnsafe` below
 *   exists to make sure nobody reaches for it by accident.
 * - a non-negative integer → trust that many hops closest to this server. This
 *   is the right answer for almost every hosted deployment.
 * - anything else → passed through verbatim, which is how Express's own
 *   presets (`loopback`, `linklocal`, `uniquelocal`) and comma-separated
 *   IP/CIDR allowlists are expressed.
 *
 * Case- and whitespace-insensitive for the keyword forms.
 */
export function parseTrustProxy(raw: string | undefined): TrustProxySetting {
  const value = raw?.trim();
  if (value === undefined || value === '') return false;

  const lower = value.toLowerCase();
  if (lower === 'false' || lower === '0' || lower === 'off' || lower === 'no') return false;
  if (lower === 'true' || lower === 'on' || lower === 'yes') return true;

  // Integer hop counts only. `parseInt` would happily read "2abc" as 2 and
  // "1.9" as 1, so match the whole string instead — a malformed value must fall
  // through to the passthrough branch, where Express will reject it loudly,
  // rather than quietly becoming a hop count nobody intended.
  if (/^\d+$/.test(value)) return Number(value);

  return value;
}

/**
 * Returns a warning to log at boot, or null when the configuration is sound.
 *
 * Two failure modes are worth a line in the logs, and both are silent
 * otherwise:
 *
 * 1. Running in production with no setting — the throttler is keyed on the
 *    proxy, so it is effectively global and one noisy client locks out
 *    everyone. This is the state this module was written to prevent shipping.
 * 2. `true` anywhere — the chain is attacker-controlled.
 */
export function trustProxyWarning(
  setting: TrustProxySetting,
  nodeEnv: string | undefined,
): string | null {
  if (setting === true) {
    return (
      'TRUST_PROXY=true trusts the ENTIRE X-Forwarded-For chain, so any client can ' +
      'spoof its address — defeating the rate limiter and the IP audit columns. ' +
      'Prefer the number of proxies actually in front of this process (e.g. 1).'
    );
  }
  if (setting === false && nodeEnv === 'production') {
    return (
      'TRUST_PROXY is not set. Behind a reverse proxy every request appears to ' +
      'come from the proxy, so the 100/min throttle becomes one shared bucket for ' +
      'all callers and Session.ipAddress records the proxy. Set it to the number ' +
      'of proxies in front of this process.'
    );
  }
  return null;
}
