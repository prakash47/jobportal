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
  ): Promise<
    { user: User; isNew: boolean } | { user: null; reason: 'email-required' | 'email-unverified' }
  > {
    const byApple = await prisma.user.findUnique({ where: { appleId: claims.sub } });
    // The `sub` is proof of ownership on its own, so a known Apple user needs
    // no email at all — which is what makes repeat sign-ins work when Apple
    // omits the claim.
    if (byApple) return { user: byApple, isNew: false };

    const email = claims.email;
    if (!email) return { user: null, reason: 'email-required' };

    // REFUSE OUTRIGHT on an unverified address, before anything touches the
    // database. This used to be a condition wrapped around the link branch
    // only, which was not enough and was an account-takeover hole: an
    // unverified claim skipped linking, fell through to `create`, collided on
    // `User.email @unique`, and the P2002 recovery below re-matched that very
    // account BY EMAIL and returned it as the signed-in identity — handing out
    // a session on an account the token never proved ownership of.
    //
    // Refusing here means every path past this point has a verified address,
    // so the recovery is safe by construction rather than by a second check
    // someone could later forget to keep in sync.
    if (!claims.emailVerified) return { user: null, reason: 'email-unverified' };

    {
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

    try {
      const user = await prisma.user.create({
        data: {
          email,
          // Apple gives us a name once or not at all. Fall back to the local
          // part rather than storing an empty string, matching the Google path.
          name: clientName?.trim() || (email.split('@')[0] ?? email),
          provider: 'APPLE',
          appleId: claims.sub,
          // Provably true by the guard above, written as a literal so this
          // cannot silently become `false` if the guard is ever relaxed.
          emailVerified: true,
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
      //
      // Matching by email here is only sound because an unverified address was
      // refused above and can never reach this point. If that guard is ever
      // moved or weakened, THIS becomes an account-takeover path again — it
      // was exactly that before the guard was hoisted.
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
