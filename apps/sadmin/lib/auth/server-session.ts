// Mirror of apps/recruiter/lib/auth/server-session.ts. Reads the access_token
// cookie set by the API's /auth/admin/login response, verifies the JWT with
// @jobportal/auth, and returns AccessClaims (or null).
//
// Cookie scope note — important for this portal specifically: in dev the API at
// localhost:4000 sets the cookie with no Domain attribute, so the scope is the
// HOST alone ('localhost'). Cookies are not port-scoped, so :3003 sees exactly
// the same cookie as :3000 (seeker) and :3001 (recruiter). A recruiter who is
// signed in elsewhere therefore arrives here already carrying a valid token —
// which is precisely why requireSuperAdmin() must check the ROLE and never
// merely "is there a session". In prod COOKIE_DOMAIN is set to a shared parent
// so all subdomains share the jar in the same way.
//
// WHY THE CATCH BELOW IS CLASSIFIED RATHER THAN BARE
// --------------------------------------------------
// This file used to end in `catch { return null }`. That single line cost the
// team a day: a teammate whose apps/sadmin/.env was missing signed in
// successfully — correct password, real ADMIN account, API returned 200 and set
// the cookie — and then landed straight back on the sign-in form with no error
// anywhere. verifyAccessToken had thrown 'JWT_ACCESS_SECRET is not set', the
// bare catch turned that into "you are anonymous", and requireSuperAdmin()
// dutifully redirected to /login. Nothing was logged, nothing reached Sentry,
// and the login page renders fine without any env at all, so the portal looked
// healthy while being unable to authenticate anyone.
//
// The dividing line is NOT "which error class" but: CAN A FRESH SIGN-IN FIX IT?
//   • Bad / expired / not-yet-valid token → yes. The caller really is signed
//     out; null and a redirect to /login are honest. This is the normal path.
//   • No JWT_ACCESS_SECRET → no. Nobody can ever sign in on this server, so
//     sending them to a form that cannot work is a lie and an invisible loop.
//     Throw, so it surfaces as a real error with a real message.
//
// Note that a MISMATCHED secret (apps/sadmin's differs from the API's) is
// indistinguishable from a forged token — both are JsonWebTokenError
// 'invalid signature' — so it must stay in the null branch. The warn is what
// makes it diagnosable: a browser only ever holds tokens our own API minted, so
// an invalid signature on a real sign-in means the two .env files have drifted.
//
// Boot-time assertion in lib/env.ts is the primary guard; this is defence in
// depth for anything that slips past it.

import { cookies } from 'next/headers';
import {
  ACCESS_COOKIE,
  JsonWebTokenError,
  NotBeforeError,
  TokenExpiredError,
  verifyAccessToken,
  type AccessClaims,
} from '@jobportal/auth';

export async function readUserFromCookie(): Promise<AccessClaims | null> {
  const jar = await cookies();
  const token = jar.get(ACCESS_COOKIE)?.value;
  if (!token) return null;

  try {
    return verifyAccessToken(token);
  } catch (err) {
    // Ordered subclass-first: TokenExpiredError and NotBeforeError both extend
    // JsonWebTokenError, so testing the base class first would swallow them.

    // The 15-minute access token lapsed. Overwhelmingly the common case — this
    // portal wires no refresh, so every session ends this way. Silent by design.
    if (err instanceof TokenExpiredError) return null;

    // Clock skew between the signing and verifying hosts. Must NOT throw, or a
    // few seconds of drift turns into a 500 on the console's entry point.
    if (err instanceof NotBeforeError) return null;

    // Malformed, tampered with, or signed with a different secret. Cannot be
    // told apart from a forgery, so the user is treated as signed out — but the
    // secret-drift case is a misconfiguration worth naming in the log.
    if (err instanceof JsonWebTokenError) {
      console.warn(
        `[sadmin] access_token rejected (${err.message}). If this happened on a real sign-in, ` +
          `JWT_ACCESS_SECRET in apps/sadmin/.env does not match the one apps/api is running with.`,
      );
      return null;
    }

    // Reachable only AFTER jwt.verify() succeeded (packages/auth/src/tokens.ts
    // throws this below the verify call), so the token was signed with our own
    // secret and no attacker can trigger it. It means our signer emitted a
    // non-object payload — a real bug, but one a fresh sign-in would clear, so
    // it stays a logout rather than a 500 on the only way into the console.
    if (err instanceof Error && err.message === 'Malformed access token payload') {
      console.error('[sadmin] access_token verified but carried a non-object payload.', err);
      return null;
    }

    // Anything else means THIS SERVER cannot verify anyone — in practice a
    // missing JWT_ACCESS_SECRET. Redirecting to /login would hide it forever.
    console.error(
      '[sadmin] cannot verify the session cookie — this server is misconfigured, ' +
        'not signed out. Check apps/sadmin/.env exists and defines JWT_ACCESS_SECRET.',
      err,
    );
    throw err;
  }
}
