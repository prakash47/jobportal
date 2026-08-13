import { generateKeyPairSync, type KeyObject } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GOOGLE_OIDC,
  OidcProviderUnavailableError,
  OidcVerificationError,
  OidcVerifierService,
} from './oidc-verifier.service';

// Two independent RSA key pairs: one stands in for the provider, the other for
// an ATTACKER who can sign perfectly well-formed tokens with the wrong key.
// That second pair is the whole point of this file — the bug it guards against
// is a verifier that decodes without checking the signature, which accepts an
// attacker-signed token exactly as readily as a real one.
const provider = generateKeyPairSync('rsa', { modulusLength: 2048 });
const attacker = generateKeyPairSync('rsa', { modulusLength: 2048 });

const KID = 'test-key-1';
const AUD = 'com.careerqueue.app';
const ISS = 'https://accounts.google.com';

function jwksFor(key: KeyObject, kid = KID): { keys: unknown[] } {
  const jwk = key.export({ format: 'jwk' }) as Record<string, unknown>;
  return { keys: [{ ...jwk, kid, alg: 'RS256', use: 'sig' }] };
}

function sign(
  payload: Record<string, unknown>,
  key = provider.privateKey,
  opts: jwt.SignOptions = {},
): string {
  return jwt.sign(payload, key, { algorithm: 'RS256', keyid: KID, ...opts });
}

const OPTS = { jwksUri: GOOGLE_OIDC.jwksUri, issuers: GOOGLE_OIDC.issuers, audiences: [AUD] };

function claims(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    sub: 'google-sub-123',
    email: 'Person@Example.com',
    email_verified: true,
    name: 'A Person',
    iss: ISS,
    aud: AUD,
    exp: Math.floor(Date.now() / 1000) + 600,
    iat: Math.floor(Date.now() / 1000),
    ...over,
  };
}

let service: OidcVerifierService;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  service = new OidcVerifierService();
  fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => jwksFor(provider.publicKey) });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('OidcVerifierService — the signature is actually checked', () => {
  it('accepts a genuinely signed token', async () => {
    const out = await service.verify(sign(claims()), OPTS);
    expect(out.sub).toBe('google-sub-123');
    expect(out.emailVerified).toBe(true);
    // Normalised, so a provider returning mixed case cannot create a second
    // account for the same person.
    expect(out.email).toBe('person@example.com');
  });

  // THE test. A token signed by anyone else must be refused. If this passes
  // while the implementation only base64-decodes, the endpoint is a complete
  // authentication bypass: forge any `sub`/`email` and become that user.
  it('REJECTS a well-formed token signed with the wrong key', async () => {
    const forged = sign(claims({ email: 'ceo@example.com' }), attacker.privateKey);
    await expect(service.verify(forged, OPTS)).rejects.toBeInstanceOf(OidcVerificationError);
  });

  // `alg: none` is the oldest JWT attack there is. Measured caveat, stated so
  // nobody mistakes this for proof that our `algorithms` pin is what stops it:
  // jsonwebtoken 9.0.3 rejects this on its own, because it derives the allowed
  // algorithms from the RSA public key it is handed. The test asserts the
  // OUTCOME we require, not the mechanism.
  it('rejects an unsigned alg:none token', async () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', kid: KID })).toString('base64url');
    const body = Buffer.from(JSON.stringify(claims())).toString('base64url');
    await expect(service.verify(`${header}.${body}.`, OPTS)).rejects.toBeInstanceOf(
      OidcVerificationError,
    );
  });

  // Algorithm confusion: sign with HMAC using the provider's PUBLIC key as the
  // shared secret. Same caveat as above — jsonwebtoken rejects this by key type
  // even with the pin removed, so this guards the outcome rather than proving
  // the pin. The genuinely load-bearing guard is the wrong-key test above,
  // which DOES go red when signature verification is removed.
  it('rejects an HS256 token signed with the public key as secret', async () => {
    const pub = provider.publicKey.export({ type: 'spki', format: 'pem' }).toString();
    const confused = jwt.sign(claims(), pub, { algorithm: 'HS256', keyid: KID });
    await expect(service.verify(confused, OPTS)).rejects.toBeInstanceOf(OidcVerificationError);
  });
});

describe('OidcVerifierService — claim checks', () => {
  it('rejects a token minted for a DIFFERENT audience', async () => {
    // A real, provider-signed token for somebody else's app.
    const other = sign(claims({ aud: 'com.someone.else' }));
    await expect(service.verify(other, OPTS)).rejects.toBeInstanceOf(OidcVerificationError);
  });

  it('rejects an unexpected issuer', async () => {
    await expect(
      service.verify(sign(claims({ iss: 'https://evil.example' })), OPTS),
    ).rejects.toBeInstanceOf(OidcVerificationError);
  });

  it('rejects an expired token', async () => {
    const old = sign(claims({ exp: Math.floor(Date.now() / 1000) - 3600 }));
    await expect(service.verify(old, OPTS)).rejects.toBeInstanceOf(OidcVerificationError);
  });

  // An unconfigured provider must fail CLOSED, and must do so BEFORE any
  // network call. (jsonwebtoken would also reject an empty audience list on its
  // own — it matches nothing — but relying on that would make a missing env var
  // surface as a confusing "audience invalid" instead of what it is.)
  it('rejects everything when no audiences are configured', async () => {
    await expect(
      service.verify(sign(claims()), { ...OPTS, audiences: [] }),
    ).rejects.toBeInstanceOf(OidcVerificationError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('accepts both spellings of the Google issuer', async () => {
    const bare = sign(claims({ iss: 'accounts.google.com' }));
    await expect(service.verify(bare, OPTS)).resolves.toMatchObject({ sub: 'google-sub-123' });
  });

  it('treats email_verified as a string too', async () => {
    const out = await service.verify(sign(claims({ email_verified: 'true' })), OPTS);
    expect(out.emailVerified).toBe(true);
  });

  it('reports an unverified email rather than assuming it is fine', async () => {
    const out = await service.verify(sign(claims({ email_verified: false })), OPTS);
    expect(out.emailVerified).toBe(false);
  });

  it('flags an Apple private-relay address', async () => {
    const out = await service.verify(
      sign(claims({ email: 'abc123@privaterelay.appleid.com' })),
      OPTS,
    );
    expect(out.isPrivateRelayEmail).toBe(true);
  });

  it('does not flag an ordinary address as private relay', async () => {
    const out = await service.verify(sign(claims()), OPTS);
    expect(out.isPrivateRelayEmail).toBe(false);
  });

  it('rejects a token with no sub', async () => {
    const noSub = jwt.sign({ ...claims(), sub: undefined }, provider.privateKey, {
      algorithm: 'RS256',
      keyid: KID,
    });
    await expect(service.verify(noSub, OPTS)).rejects.toBeInstanceOf(OidcVerificationError);
  });
});

describe('OidcVerifierService — JWKS handling', () => {
  it('rejects a malformed token without fetching anything', async () => {
    await expect(service.verify('not.a.jwt.at.all', OPTS)).rejects.toBeInstanceOf(
      OidcVerificationError,
    );
    await expect(service.verify('missing-parts', OPTS)).rejects.toBeInstanceOf(
      OidcVerificationError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a header with no kid', async () => {
    const noKid = jwt.sign(claims(), provider.privateKey, { algorithm: 'RS256' });
    await expect(service.verify(noKid, OPTS)).rejects.toBeInstanceOf(OidcVerificationError);
  });

  it('caches the JWKS across calls rather than refetching per request', async () => {
    await service.verify(sign(claims()), OPTS);
    await service.verify(sign(claims()), OPTS);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // Key rotation: an unknown kid triggers exactly ONE refetch. Bounded on
  // purpose — otherwise random kids from an attacker become a way to make us
  // hammer the provider's JWKS endpoint.
  it('refetches once for an unknown kid, then gives up', async () => {
    await service.verify(sign(claims()), OPTS); // primes the cache
    fetchMock.mockClear();

    const rotated = jwt.sign(claims(), provider.privateKey, {
      algorithm: 'RS256',
      keyid: 'kid-we-have-never-seen',
    });
    await expect(service.verify(rotated, OPTS)).rejects.toBeInstanceOf(OidcVerificationError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('picks up a rotated key on the refetch', async () => {
    await service.verify(sign(claims()), OPTS); // primes the cache
    const NEW_KID = 'test-key-2';
    fetchMock.mockResolvedValue({ ok: true, json: async () => jwksFor(provider.publicKey, NEW_KID) });

    const rotated = jwt.sign(claims(), provider.privateKey, {
      algorithm: 'RS256',
      keyid: NEW_KID,
    });
    await expect(service.verify(rotated, OPTS)).resolves.toMatchObject({ sub: 'google-sub-123' });
  });

  // A JWKS outage must not lock every user out of signing in — the keys we
  // already hold are still genuine.
  it('keeps serving cached keys when a refresh fails', async () => {
    await service.verify(sign(claims()), OPTS); // primes the cache
    fetchMock.mockRejectedValue(new Error('network down'));

    const unknownKid = jwt.sign(claims(), provider.privateKey, {
      algorithm: 'RS256',
      keyid: 'other',
    });
    // The refetch fails, the cached map is reused, and the unknown kid is
    // simply absent — a clean rejection rather than a crash.
    await expect(service.verify(unknownKid, OPTS)).rejects.toBeInstanceOf(OidcVerificationError);
    // …and a token signed with the key we DO still hold keeps working.
    await expect(service.verify(sign(claims()), OPTS)).resolves.toMatchObject({
      sub: 'google-sub-123',
    });
  });

  it('rejects when the JWKS has no usable keys', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ keys: [] }) });
    await expect(service.verify(sign(claims()), OPTS)).rejects.toBeInstanceOf(
      OidcVerificationError,
    );
  });

  // An outage with a COLD cache is not a rejected credential. If this threw the
  // verification error, the controller would answer 401 and tell a user with a
  // perfectly good token that their sign-in failed — while hiding the outage
  // from monitoring behind an expected-looking 4xx.
  it('reports an unreachable provider distinctly from a bad token', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503, json: async () => ({}) });
    const err = await service.verify(sign(claims()), OPTS).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(OidcProviderUnavailableError);
    expect(err).not.toBeInstanceOf(OidcVerificationError);
  });

  it('reports a network failure as unreachable too', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(service.verify(sign(claims()), OPTS)).rejects.toBeInstanceOf(
      OidcProviderUnavailableError,
    );
  });
});
