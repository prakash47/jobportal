import { Injectable } from '@nestjs/common';
import { prisma, type User } from '@jobportal/db';
import type { OidcClaims } from './oidc-verifier.service';

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002';
}

/**
 * Resolve a verified Apple identity to a `User`.
 *
 * Mirrors `GoogleOAuthService.findOrCreateUser`, but Apple differs in three
 * ways that each need handling rather than assuming Google's shape:
 *
 * 1. **The name is not in the token.** Apple returns the display name exactly
 *    ONCE — on the very first authorisation, to the client, outside the ID
 *    token — and never again. So the client passes it up, and it is used ONLY
 *    when creating a new user. It must never overwrite the name on an existing
 *    account: a caller could otherwise rename any account it can sign into.
 *
 * 2. **"Hide My Email" is normal.** Apple mints a per-app
 *    `@privaterelay.appleid.com` address that really does forward. It is a
 *    legitimate, unique, deliverable address, so it is stored like any other —
 *    the one consequence being that the same human signing in with Google
 *    (real address) and Apple (relay address) will land on two accounts. That
 *    is inherent to Apple's design, not something we can reconcile.
 *
 * 3. **The email claim can be missing on repeat sign-ins.** That is fine when
 *    we already know the `sub`; it is fatal when creating, because `User.email`
 *    is required and unique. The caller turns that into a clear error rather
 *    than inventing a placeholder address.
 */
@Injectable()
export class AppleIdentityService {
  /**
   * @param claims verified Apple ID-token claims — the caller MUST have run
   *   these through `OidcVerifierService`, never a bare decode.
   * @param clientName display name supplied by the client on first sign-in.
   */
  async findOrCreateUser(
    claims: OidcClaims,
    clientName: string | undefined,
  ): Promise<{ user: User; isNew: boolean } | { user: null; reason: 'email-required' }> {
    const byApple = await prisma.user.findUnique({ where: { appleId: claims.sub } });
    if (byApple) return { user: byApple, isNew: false };

    const email = claims.email;

    // Linking by email requires a VERIFIED email, exactly as the Google path
    // does. Without that check, a provider that returned an unverified address
    // would let a stranger attach themselves to an existing account and take
    // it over.
    if (email && claims.emailVerified) {
      const byEmail = await prisma.user.findUnique({ where: { email } });
      if (byEmail) {
        const user = await prisma.user.update({
          where: { id: byEmail.id },
          data: {
            appleId: claims.sub,
            emailVerified: true,
            // provider is deliberately NOT changed: a LOCAL user keeps password
            // login, and a Google user keeps Google. It records how the account
            // was CREATED, and attaching a second provider does not rewrite that.
          },
        });
        return { user, isNew: false };
      }
    }

    if (!email) return { user: null, reason: 'email-required' };

    try {
      const user = await prisma.user.create({
        data: {
          email,
          // Apple gives us a name once or not at all. Fall back to the local
          // part rather than storing an empty string, matching the Google path.
          name: clientName?.trim() || (email.split('@')[0] ?? email),
          provider: 'APPLE',
          appleId: claims.sub,
          // Apple verifies the address it gives us, including relay addresses,
          // which satisfies the FR-4.12.8 apply gate.
          emailVerified: claims.emailVerified,
          role: 'CANDIDATE',
          // passwordHash stays null — OAuth-only account.
        },
      });
      // Provision the Candidate row up front, the same lazy row /profile would
      // create on first visit.
      await prisma.candidate.create({ data: { userId: user.id } }).catch(() => undefined);
      return { user, isNew: true };
    } catch (err) {
      // A concurrent duplicate request won the create race (appleId and email
      // are both @unique). Converge on the row it created.
      if (isUniqueViolation(err)) {
        const existing = await prisma.user.findFirst({
          where: { OR: [{ appleId: claims.sub }, { email }] },
        });
        if (existing) return { user: existing, isNew: false };
      }
      throw err;
    }
  }
}
