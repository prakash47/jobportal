import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { readAccessTokenCookie, verifyAccessToken } from '@jobportal/auth';
import type { AuthedRequest } from './jwt-auth.guard';

// The non-throwing sibling of JwtAuthGuard, for PUBLIC routes that behave
// slightly differently when they happen to know who is asking.
//
// Two callers today, and they need opposite halves of it:
//   · GET /v1/jobs/:slug — an owner, a collaborator or an admin may preview a
//     job that is not publicly readable yet. Everyone else gets the same 404.
//   · GET /v1/jobs — reserved for per-user flags on search results.
//
// ALWAYS returns true. A missing, malformed, expired or revoked token is not
// an error here; it just means `req.user` stays undefined and the caller is
// treated as anonymous. JwtAuthGuard cannot be reused for this because it
// throws on both counts, which is exactly wrong for a public endpoint —
// a bad token would turn a public page into a 401.
//
// The token is read from the same two places as the strict guard (cookie
// first, then `Authorization: Bearer`) so a browser and a phone behave
// identically.
//
// SECURITY NOTE: this guard authenticates, it does not authorise. Every route
// using it must still gate on what `req.user` is allowed to see — an
// unverified `undefined` and a verified non-owner must reach the same
// decision. It is deliberately impossible to use this guard to *grant*
// access, because it never rejects anything.
@Injectable()
export class OptionalJwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const fromCookie = readAccessTokenCookie(req);
    const auth = req.headers.authorization;
    const fromHeader = auth && auth.startsWith('Bearer ') ? auth.substring(7) : undefined;
    const token = fromCookie ?? fromHeader;
    if (!token) return true;

    try {
      req.user = verifyAccessToken(token);
    } catch {
      // Deliberately swallowed — see the header. An expired token on a public
      // route means "anonymous", never "rejected".
      //
      // `delete` rather than `= undefined`: the repo runs
      // exactOptionalPropertyTypes, so an explicit undefined is not assignable
      // to `user?: AccessClaims`. It also genuinely clears the property, which
      // is what a downstream `'user' in req` check would expect.
      delete req.user;
    }
    return true;
  }
}
