import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type AccessClaims, readAccessTokenCookie, verifyAccessToken } from '@jobportal/auth';
import { ADMIN_MODULE_LABEL } from '@jobportal/domain/admin-permissions';
import type { Request } from 'express';
import {
  ADMIN_SCOPE_KEY,
  type AdminScopeRequirement,
} from '../auth/admin-scope.decorator';
import { loadAdminStaffContext, staffHasScope, type AdminStaffContext } from '../auth/admin-staff';

interface AuthedRequest extends Request {
  user?: AccessClaims;
  adminStaff?: AdminStaffContext;
}

// Real admin guard — wired in feature/auth-jwt-system, extended with per-module
// scopes in feature/sadmin-roles-permissions (SRS §4.16).
//
// Verifies the access-token cookie (or Bearer header), enforces role === 'ADMIN',
// then loads the caller's AdminStaff row and checks the scope this route
// requires. Layer 3 — the non-bypassable boundary. A console's own
// requireAdminScope() is Layer 2 and is never the trust boundary.
//
// ── Two things that changed, and why ────────────────────────────────────────
//
// 1. `role === 'ADMIN'` is no longer sufficient, only necessary. It now means
//    "is staff at all"; what the caller may actually DO is the AdminStaff row.
//    An ADMIN with no row, or a deactivated one, gets 403 — the fail-closed
//    direction, so an account promoted by a bare `UPDATE "User" SET role=...`
//    (which is how CLAUDE.md §9 says admins are made) has no powers until a
//    tier is granted deliberately.
//
// 2. canActivate is async. It was synchronous and DB-free, which is exactly what
//    made revocation impossible: apps/sadmin never calls /auth/refresh and the
//    access token has no jti, so a privilege carried in the token could not be
//    withdrawn before it expired. One indexed read on a unique key buys
//    revocation that takes effect on the next request. See auth/admin-staff.ts.
//
// The guard stays free of constructor dependencies OTHER than Reflector (which
// Nest core always provides), so controllers keep importing it directly with
// `@UseGuards(AdminGuard)` and no module needs to register a provider — the
// property that let it be adopted by nine controllers without ceremony.
//
// NOTE ON FR-4.12.10: the SRS line "ADMIN role is assigned only via direct DB
// write — never via UI" still holds for the SUPER_ADMIN tier, which is seeded or
// written by hand and is the only tier that can grant others. Lesser staff tiers
// are provisioned through /sadmin by a super admin (docs/adr/0007). The comment
// that used to sit here asserted the unqualified version, which is no longer
// true of this codebase.
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const fromCookie = readAccessTokenCookie(req);
    const auth = req.headers.authorization;
    const fromHeader = auth && auth.startsWith('Bearer ') ? auth.substring(7) : undefined;
    const token = fromCookie ?? fromHeader;
    if (!token) throw new UnauthorizedException('No access token');

    let claims: AccessClaims;
    try {
      claims = verifyAccessToken(token);
    } catch {
      throw new UnauthorizedException('Invalid access token');
    }

    if (claims.role !== 'ADMIN') {
      throw new ForbiddenException('Admin role required');
    }

    const staff = await loadAdminStaffContext(claims.sub);
    if (!staff) {
      // Deliberately does not distinguish "no staff row" from "deactivated".
      // Both are "you have no access"; telling a deactivated staffer which one
      // applies tells them the account still exists and was switched off, which
      // is information about an internal decision, not about their own request.
      throw new ForbiddenException('No active admin staff role');
    }

    // Method-level requirement wins over controller-level. Absent = system/EDIT
    // (super admin only) — see the rationale in auth/admin-scope.decorator.ts.
    const required =
      this.reflector.getAllAndOverride<AdminScopeRequirement | undefined>(ADMIN_SCOPE_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? ({ module: 'system', level: 'EDIT' } as const);

    if (!staffHasScope(staff, required.module, required.level)) {
      // Names the module but never the caller's own grant level: "Requires Full
      // access to Subscriptions & revenue" tells a staff member what to ask for,
      // while echoing back what they currently hold would let anyone with any
      // staff token enumerate the permission model by probing routes.
      throw new ForbiddenException(
        `Requires ${required.level === 'EDIT' ? 'full' : 'view'} access to ${
          ADMIN_MODULE_LABEL[required.module]
        }`,
      );
    }

    req.user = claims;
    req.adminStaff = staff;
    return true;
  }
}
