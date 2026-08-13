import { createPublicKey, type KeyObject } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import jwt from 'jsonwebtoken';

/**
 * Verifies an OpenID Connect ID token that a CLIENT handed us.
 *
 * WHY THIS EXISTS AND WHY `GoogleOAuthService.parseIdToken` COULD NOT BE REUSED
 *
 * That method base64-decodes the payload and checks `aud` / `iss` / `exp` /
 * `nonce` — and never verifies the signature. In the browser flow that is
 * perfectly safe: the token is fetched by our server directly from Google's
 * token endpoint over TLS, so the channel itself proves where it came from.
 *
 * The moment a client posts us a token, that proof is gone. Reusing an
 * unverified decode here would let anyone hand-craft
 * `{"sub":"x","email":"ceo@example.com","email_verified":true}`, base64 it, and
 * sign in as any user on the platform. That is a total authentication bypass,
 * so this service does real RS256 verification against the issuer's published
 * JWKS.
 *
 * NO NEW DEPENDENCY. Node 24 accepts a JWK directly
 * (`createPublicKey({ key, format: 'jwk' })`), so the existing `jsonwebtoken`
 * can verify the signature once the key is materialised. Adding `jose` would
 * have meant an ESM package in a CommonJS Nest build — a shape this repo has
 * already been bitten by (ADR 0002 decision 3).
 */

/** A single key from a provider's JWKS. Only RSA keys are used by Google/Apple. */
interface Jwk {
  kty?: string;
  kid?: string;
  alg?: string;
  use?: string;
  n?: string;
  e?: string;
}

export interface OidcVerifyOptions {
  /** Where to fetch the provider's signing keys. */
  jwksUri: string;
  /** Accepted `iss` values. Google publishes two spellings. */
  issuers: readonly string[];
  /**
   * Accepted `aud` values — our OAuth client IDs.
   *
   * A LIST, not a single value, and that is load-bearing: a Google ID token
   * minted on Android carries the Android client id, iOS carries the iOS one,
   * and the website carries a third. Checking against one id would reject two
   * of the three platforms.
   *
   * An EMPTY list means the provider is not configured, and every token is
   * rejected — never "allow anything".
   */
  audiences: readonly string[];
  /** Seconds of leeway for clock skew between us and the device. */
  clockToleranceSeconds?: number;
}

export interface OidcClaims {
  sub: string;
  email?: string | undefined;
  emailVerified: boolean;
  name?: string | undefined;
  picture?: string | undefined;
  /** True when Apple minted a `@privaterelay.appleid.com` address. */
  isPrivateRelayEmail: boolean;
}

/** Thrown for every rejection. The message is for OUR logs, never the client. */
export class OidcVerificationError extends Error {}

/**
 * Narrow a list to the non-empty tuple `jsonwebtoken` requires.
 *
 * Not ceremony: passing an empty array to `jwt.verify`'s `issuer`/`audience`
 * disables that check entirely, so "no configured audiences" would silently
 * become "accept a token minted for anyone". Failing loudly is the point.
 */
function toNonEmpty(values: readonly string[], label: string): [string, ...string[]] {
  const [first, ...rest] = values;
  if (first === undefined) throw new OidcVerificationError(`no ${label} configured`);
  return [first, ...rest];
}

const JWKS_TTL_MS = 60 * 60 * 1000; // Google and Apple both rotate slowly.
const APPLE_PRIVATE_RELAY_DOMAIN = '@privaterelay.appleid.com';

@Injectable()
export class OidcVerifierService {
  private readonly logger = new Logger(OidcVerifierService.name);
  private readonly cache = new Map<string, { fetchedAt: number; keys: Map<string, KeyObject> }>();

  /**
   * Verify a raw ID token and return the claims we care about.
   *
   * Throws `OidcVerificationError` for every failure — signature, issuer,
   * audience, expiry, algorithm, missing subject. Callers must translate that
   * into one generic 401 and must NOT surface the reason: telling a caller
   * whether the audience or the signature failed is free reconnaissance.
   */
  async verify(rawToken: string, opts: OidcVerifyOptions): Promise<OidcClaims> {
    if (opts.audiences.length === 0) {
      throw new OidcVerificationError('provider not configured (no audiences)');
    }

    const kid = this.readKid(rawToken);
    let key = await this.keyFor(opts.jwksUri, kid, false);
    if (!key) {
      // Unknown kid usually means the provider rotated keys since we cached.
      // Refetch ONCE. Bounded on purpose: an attacker sending random kids must
      // not be able to make us hammer Google's JWKS endpoint.
      key = await this.keyFor(opts.jwksUri, kid, true);
    }
    if (!key) throw new OidcVerificationError(`no JWKS key for kid=${kid}`);

    // jsonwebtoken's types require a NON-EMPTY tuple for issuer/audience, and
    // that is a useful constraint rather than a nuisance: an empty array would
    // silently mean "accept anything". The audience guard above already
    // rejects the empty case; narrow to the tuple shape here so the compiler
    // holds us to it instead of a cast hiding it.
    const issuers = toNonEmpty(opts.issuers, 'issuers');
    const audiences = toNonEmpty(opts.audiences, 'audiences');

    let payload: jwt.JwtPayload;
    try {
      const verified = jwt.verify(rawToken, key, {
        // Pinned. Without this, a token with `alg: "none"`, or one signed with
        // HMAC using the public key as the secret, could be accepted — the
        // classic JWT confusion attacks.
        algorithms: ['RS256'],
        issuer: issuers,
        audience: audiences,
        clockTolerance: opts.clockToleranceSeconds ?? 60,
      });
      if (typeof verified === 'string') throw new Error('unexpected string payload');
      payload = verified;
    } catch (err) {
      throw new OidcVerificationError(
        `id_token rejected: ${err instanceof Error ? err.message : 'unknown'}`,
      );
    }

    const sub = typeof payload.sub === 'string' ? payload.sub : null;
    if (!sub) throw new OidcVerificationError('id_token has no sub');

    const email = typeof payload['email'] === 'string' ? payload['email'].toLowerCase() : undefined;
    // Both providers have been observed sending this as a STRING as well as a
    // boolean, so accept both rather than silently treating "true" as false.
    const rawVerified = payload['email_verified'];
    const emailVerified = rawVerified === true || rawVerified === 'true';

    return {
      sub,
      email,
      emailVerified,
      name: typeof payload['name'] === 'string' ? payload['name'] : undefined,
      picture: typeof payload['picture'] === 'string' ? payload['picture'] : undefined,
      isPrivateRelayEmail: email !== undefined && email.endsWith(APPLE_PRIVATE_RELAY_DOMAIN),
    };
  }

  /** Read `kid` from the JOSE header without trusting anything else in the token. */
  private readKid(rawToken: string): string {
    const parts = rawToken.split('.');
    if (parts.length !== 3) throw new OidcVerificationError('malformed id_token');
    let header: { kid?: unknown; alg?: unknown };
    try {
      header = JSON.parse(Buffer.from(parts[0]!, 'base64url').toString('utf8')) as {
        kid?: unknown;
        alg?: unknown;
      };
    } catch {
      throw new OidcVerificationError('unreadable id_token header');
    }
    if (typeof header.kid !== 'string' || header.kid.length === 0) {
      throw new OidcVerificationError('id_token header has no kid');
    }
    return header.kid;
  }

  private async keyFor(jwksUri: string, kid: string, forceRefresh: boolean): Promise<KeyObject | null> {
    const cached = this.cache.get(jwksUri);
    const fresh = cached && Date.now() - cached.fetchedAt < JWKS_TTL_MS;
    if (!forceRefresh && fresh) return cached.keys.get(kid) ?? null;
    if (!forceRefresh && cached && !fresh) {
      // Expired: fall through and refetch.
    }

    const keys = await this.fetchJwks(jwksUri, cached?.keys);
    this.cache.set(jwksUri, { fetchedAt: Date.now(), keys });
    return keys.get(kid) ?? null;
  }

  private async fetchJwks(
    jwksUri: string,
    previous: Map<string, KeyObject> | undefined,
  ): Promise<Map<string, KeyObject>> {
    let body: { keys?: Jwk[] };
    try {
      const res = await fetch(jwksUri, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      body = (await res.json()) as { keys?: Jwk[] };
    } catch (err) {
      // Keep serving the previous keys if we have them: a transient JWKS
      // outage should not lock every user out of signing in, and the keys we
      // already hold are still genuine.
      if (previous && previous.size > 0) {
        this.logger.warn(
          `JWKS refresh failed for ${jwksUri}, reusing ${previous.size} cached key(s): ` +
            `${err instanceof Error ? err.message : 'unknown'}`,
        );
        return previous;
      }
      throw new OidcVerificationError(
        `JWKS fetch failed: ${err instanceof Error ? err.message : 'unknown'}`,
      );
    }

    const out = new Map<string, KeyObject>();
    for (const jwk of body.keys ?? []) {
      // RSA signing keys only. An EC or symmetric key here would not be usable
      // by the RS256 pin above anyway.
      if (jwk.kty !== 'RSA' || !jwk.kid || !jwk.n || !jwk.e) continue;
      if (jwk.use !== undefined && jwk.use !== 'sig') continue;
      try {
        out.set(jwk.kid, createPublicKey({ key: jwk as never, format: 'jwk' }));
      } catch (err) {
        this.logger.warn(
          `skipping unusable JWKS key ${jwk.kid}: ${err instanceof Error ? err.message : 'unknown'}`,
        );
      }
    }
    if (out.size === 0) throw new OidcVerificationError(`JWKS at ${jwksUri} yielded no usable keys`);
    return out;
  }
}

/** Provider constants — the issuer spellings and JWKS endpoints are fixed. */
export const GOOGLE_OIDC = {
  jwksUri: 'https://www.googleapis.com/oauth2/v3/certs',
  // Google really does publish both, and tokens carry either.
  issuers: ['https://accounts.google.com', 'accounts.google.com'] as const,
} as const;

export const APPLE_OIDC = {
  jwksUri: 'https://appleid.apple.com/auth/keys',
  issuers: ['https://appleid.apple.com'] as const,
} as const;
