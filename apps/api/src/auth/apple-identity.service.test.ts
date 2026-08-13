import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@jobportal/db', () => ({
  prisma: {
    user: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
    candidate: { create: vi.fn() },
  },
}));

import { prisma } from '@jobportal/db';
import { AppleIdentityService } from './apple-identity.service';
import type { OidcClaims } from './oidc-verifier.service';

const mocked = prisma as unknown as {
  user: {
    findUnique: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
  candidate: { create: ReturnType<typeof vi.fn> };
};

function claims(over: Partial<OidcClaims> = {}): OidcClaims {
  return {
    sub: 'apple-sub-1',
    email: 'person@example.com',
    emailVerified: true,
    isPrivateRelayEmail: false,
    ...over,
  };
}

let service: AppleIdentityService;

beforeEach(() => {
  vi.resetAllMocks();
  mocked.candidate.create.mockResolvedValue({});
  service = new AppleIdentityService();
});

describe('AppleIdentityService.findOrCreateUser', () => {
  it('returns the existing user when the apple sub is known', async () => {
    mocked.user.findUnique.mockResolvedValueOnce({ id: 5, email: 'person@example.com' });
    const out = await service.findOrCreateUser(claims(), 'Ignored Name');
    expect(out).toEqual({ user: { id: 5, email: 'person@example.com' }, isNew: false });
    // Fast path: it must not go looking by email once the sub matched.
    expect(mocked.user.findUnique).toHaveBeenCalledTimes(1);
  });

  it('links Apple to an existing account with the same verified email', async () => {
    mocked.user.findUnique
      .mockResolvedValueOnce(null) // by appleId
      .mockResolvedValueOnce({ id: 7, email: 'person@example.com' }); // by email
    mocked.user.update.mockResolvedValue({ id: 7 });

    const out = await service.findOrCreateUser(claims(), undefined);
    expect(out).toEqual({ user: { id: 7 }, isNew: false });
    expect(mocked.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 7 },
        data: expect.objectContaining({ appleId: 'apple-sub-1', emailVerified: true }),
      }),
    );
  });

  // ACCOUNT TAKEOVER GUARD. If a provider hands us an unverified address,
  // resolving on it would let a stranger reach somebody else's account.
  //
  // The first version of this test mocked `user.create` to SUCCEED, so it never
  // exercised the path that actually mattered and passed while the code was
  // vulnerable. The real hole was downstream: an unverified claim skipped
  // linking, fell through to create, collided on `User.email @unique`, and the
  // P2002 recovery re-matched the victim BY EMAIL and returned their account.
  // These now drive that collision.
  it('refuses an unverified email outright, before touching the database', async () => {
    mocked.user.findUnique.mockResolvedValueOnce(null); // by appleId

    const out = await service.findOrCreateUser(claims({ emailVerified: false }), 'New Person');

    expect(out).toEqual({ user: null, reason: 'email-unverified' });
    // Only the appleId lookup happened — no email lookup, no create, no link.
    expect(mocked.user.findUnique).toHaveBeenCalledTimes(1);
    expect(mocked.user.update).not.toHaveBeenCalled();
    expect(mocked.user.create).not.toHaveBeenCalled();
  });

  // THE regression test. With the guard applied only to the link branch, this
  // returned the victim's account and the controller minted a session for it.
  it('does NOT resolve a victim account through the unique-violation recovery', async () => {
    mocked.user.findUnique.mockResolvedValueOnce(null); // by appleId
    // Arm the collision + recovery exactly as the vulnerable path did.
    mocked.user.create.mockRejectedValue(Object.assign(new Error('dup'), { code: 'P2002' }));
    mocked.user.findFirst.mockResolvedValue({ id: 999, email: 'victim@example.com' });

    const out = await service.findOrCreateUser(
      claims({ email: 'victim@example.com', emailVerified: false }),
      'Attacker',
    );

    expect(out).toEqual({ user: null, reason: 'email-unverified' });
    // The recovery must never even be reached.
    expect(mocked.user.findFirst).not.toHaveBeenCalled();
  });

  // Apple hands the display name to the CLIENT once and never again, so the
  // client relays it — which means a caller controls this string. It may only
  // ever name a NEW account; allowing it through on an existing one would let
  // anyone who can sign in rename that account.
  it('never renames an existing account with the client-supplied name', async () => {
    mocked.user.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 7, name: 'Real Name', email: 'person@example.com' });
    mocked.user.update.mockResolvedValue({ id: 7, name: 'Real Name' });

    await service.findOrCreateUser(claims(), 'Attacker Supplied');

    const data = mocked.user.update.mock.calls[0]![0].data;
    expect(data).not.toHaveProperty('name');
  });

  // Linking must not rewrite how the account was created — a LOCAL user keeps
  // password login, a Google user keeps Google.
  it('does not change the provider when linking', async () => {
    mocked.user.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 7, provider: 'LOCAL', email: 'person@example.com' });
    mocked.user.update.mockResolvedValue({ id: 7 });

    await service.findOrCreateUser(claims(), undefined);
    expect(mocked.user.update.mock.calls[0]![0].data).not.toHaveProperty('provider');
  });

  it('creates a new APPLE user with the client name and provisions the candidate row', async () => {
    mocked.user.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    mocked.user.create.mockResolvedValue({ id: 11 });

    const out = await service.findOrCreateUser(claims(), '  Priya Nair  ');
    expect(out).toEqual({ user: { id: 11 }, isNew: true });
    expect(mocked.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: 'person@example.com',
          name: 'Priya Nair',
          provider: 'APPLE',
          appleId: 'apple-sub-1',
          emailVerified: true,
          role: 'CANDIDATE',
        }),
      }),
    );
    expect(mocked.candidate.create).toHaveBeenCalledWith({ data: { userId: 11 } });
  });

  it('falls back to the email local part when Apple gave no name', async () => {
    mocked.user.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    mocked.user.create.mockResolvedValue({ id: 12 });

    await service.findOrCreateUser(claims(), undefined);
    expect(mocked.user.create.mock.calls[0]![0].data.name).toBe('person');
  });

  // "Hide My Email" is the normal case, not an edge case: the relay address
  // really forwards, so it is stored like any other.
  it('accepts a private-relay address as a real account email', async () => {
    mocked.user.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    mocked.user.create.mockResolvedValue({ id: 13 });

    await service.findOrCreateUser(
      claims({ email: 'abc123@privaterelay.appleid.com', isPrivateRelayEmail: true }),
      'Relay User',
    );
    expect(mocked.user.create.mock.calls[0]![0].data.email).toBe(
      'abc123@privaterelay.appleid.com',
    );
  });

  // Apple omits the email on repeat sign-ins. Fine when the sub is known,
  // fatal when creating — User.email is required and unique, and inventing a
  // placeholder would create an account nobody can ever be contacted at.
  it('reports email-required rather than inventing an address', async () => {
    mocked.user.findUnique.mockResolvedValueOnce(null);
    const out = await service.findOrCreateUser(claims({ email: undefined }), 'No Email');
    expect(out).toEqual({ user: null, reason: 'email-required' });
    expect(mocked.user.create).not.toHaveBeenCalled();
  });

  // Two devices signing in at once: appleId and email are both @unique, so one
  // create loses with P2002. Converge on the row the winner made rather than
  // 500-ing the loser.
  it('converges on the winner of a concurrent create race', async () => {
    mocked.user.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    mocked.user.create.mockRejectedValue(Object.assign(new Error('dup'), { code: 'P2002' }));
    mocked.user.findFirst.mockResolvedValue({ id: 21 });

    const out = await service.findOrCreateUser(claims(), 'Racer');
    expect(out).toEqual({ user: { id: 21 }, isNew: false });
  });

  it('rethrows a non-P2002 failure', async () => {
    mocked.user.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    mocked.user.create.mockRejectedValue(Object.assign(new Error('db down'), { code: 'P1001' }));
    await expect(service.findOrCreateUser(claims(), 'X')).rejects.toThrow('db down');
  });
});
