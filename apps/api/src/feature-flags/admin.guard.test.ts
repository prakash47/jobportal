import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// AdminGuard had NO test file before feature/sadmin-roles-permissions, which is
// how a rewrite of it from sync to async — adding a DB read and an entire
// per-module scope check — left all 1427 API tests green. It is the single
// non-bypassable boundary in front of all 30 admin routes, so the absence was
// the finding, not the pass rate.
//
// Everything here is asserted through canActivate(), not through the helpers it
// calls, because the failure modes that matter are ordering ones: authenticating
// after authorizing, or checking the scope before confirming the caller is staff
// at all, would each pass a helper-level test and be a vulnerability.

vi.mock('@jobportal/db', () => ({
  prisma: { adminStaff: { findUnique: vi.fn() } },
}));

vi.mock('@jobportal/auth', () => ({
  readAccessTokenCookie: vi.fn(),
  verifyAccessToken: vi.fn(),
}));

import { prisma } from '@jobportal/db';
import { readAccessTokenCookie, verifyAccessToken } from '@jobportal/auth';
import { AdminGuard } from './admin.guard';
import { ADMIN_SCOPE_KEY, type AdminScopeRequirement } from '../auth/admin-scope.decorator';

const m = prisma as unknown as { adminStaff: { findUnique: ReturnType<typeof vi.fn> } };
const readCookie = readAccessTokenCookie as unknown as ReturnType<typeof vi.fn>;
const verify = verifyAccessToken as unknown as ReturnType<typeof vi.fn>;

const ADMIN_CLAIMS = { sub: 200023, email: 'admin@careerqueue.in', role: 'ADMIN', emailVerified: true };

type Req = { headers: Record<string, string>; user?: unknown; adminStaff?: unknown };

function makeContext(req: Req) {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => function handler() {},
    getClass: () => class Ctrl {},
  } as never;
}

/** A Reflector stand-in that returns a fixed requirement for every lookup. */
function reflectorReturning(req: AdminScopeRequirement | undefined) {
  return {
    getAllAndOverride: vi.fn((key: string) => {
      expect(key).toBe(ADMIN_SCOPE_KEY);
      return req;
    }),
  } as never;
}

function guardFor(requirement: AdminScopeRequirement | undefined) {
  return new AdminGuard(reflectorReturning(requirement));
}

beforeEach(() => {
  vi.resetAllMocks();
  readCookie.mockReturnValue(undefined);
  verify.mockReturnValue({ ...ADMIN_CLAIMS });
});

describe('authentication (runs before any authorization)', () => {
  it('401s when no cookie and no bearer header is present', async () => {
    const guard = guardFor({ module: 'support', level: 'READ_ONLY' });
    await expect(guard.canActivate(makeContext({ headers: {} }))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(m.adminStaff.findUnique).not.toHaveBeenCalled();
  });

  it('401s on an unverifiable token without reaching the database', async () => {
    verify.mockImplementation(() => {
      throw new Error('bad signature');
    });
    const guard = guardFor({ module: 'support', level: 'READ_ONLY' });
    await expect(
      guard.canActivate(makeContext({ headers: { authorization: 'Bearer nope' } })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(m.adminStaff.findUnique).not.toHaveBeenCalled();
  });

  it('accepts a Bearer header, not only the cookie', async () => {
    // Load-bearing: /v1/auth/mobile/login returns an access token in its response
    // BODY, so this header path is a real way to reach admin routes and must be
    // held to the same standard as the cookie.
    m.adminStaff.findUnique.mockResolvedValue({
      staffRole: 'SUPPORT_ADMIN',
      permissions: null,
      deactivatedAt: null,
    });
    const guard = guardFor({ module: 'support', level: 'EDIT' });
    await expect(
      guard.canActivate(makeContext({ headers: { authorization: 'Bearer good' } })),
    ).resolves.toBe(true);
    expect(verify).toHaveBeenCalledWith('good');
  });
});

describe('staff gate', () => {
  it('403s a non-ADMIN UserRole before touching the database', async () => {
    verify.mockReturnValue({ ...ADMIN_CLAIMS, role: 'CANDIDATE' });
    const guard = guardFor({ module: 'support', level: 'READ_ONLY' });
    await expect(
      guard.canActivate(makeContext({ headers: { authorization: 'Bearer t' } })),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(m.adminStaff.findUnique).not.toHaveBeenCalled();
  });

  // The fail-closed direction. CLAUDE.md §9 makes admins with a bare
  // `UPDATE "User" SET role='ADMIN'`, so this is the state a hand-promoted
  // account actually lands in — it must have no powers until a tier is granted.
  it('403s an ADMIN with no AdminStaff row', async () => {
    m.adminStaff.findUnique.mockResolvedValue(null);
    const guard = guardFor({ module: 'support', level: 'READ_ONLY' });
    await expect(
      guard.canActivate(makeContext({ headers: { authorization: 'Bearer t' } })),
    ).rejects.toThrow(/no active admin staff role/i);
  });

  it('403s a deactivated staff member even with a full grant', async () => {
    m.adminStaff.findUnique.mockResolvedValue({
      staffRole: 'SUPER_ADMIN',
      permissions: null,
      deactivatedAt: new Date('2026-08-01T00:00:00.000Z'),
    });
    const guard = guardFor({ module: 'support', level: 'READ_ONLY' });
    await expect(
      guard.canActivate(makeContext({ headers: { authorization: 'Bearer t' } })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('does not tell a deactivated staffer that their account exists', async () => {
    // "No staff row" and "deactivated" must be indistinguishable — the difference
    // is information about an internal decision, not about the caller's request.
    const messages: string[] = [];
    for (const row of [null, { staffRole: 'SUPER_ADMIN', permissions: null, deactivatedAt: new Date() }]) {
      m.adminStaff.findUnique.mockResolvedValue(row);
      const guard = guardFor({ module: 'support', level: 'READ_ONLY' });
      await guard
        .canActivate(makeContext({ headers: { authorization: 'Bearer t' } }))
        .catch((e: Error) => messages.push(e.message));
    }
    expect(messages).toHaveLength(2);
    expect(messages[0]).toBe(messages[1]);
  });
});

describe('scope enforcement', () => {
  function withRole(staffRole: string, permissions: unknown = null) {
    m.adminStaff.findUnique.mockResolvedValue({ staffRole, permissions, deactivatedAt: null });
  }

  it('allows a matching grant and attaches the resolved context to the request', async () => {
    withRole('SUPPORT_ADMIN');
    const req: Req = { headers: { authorization: 'Bearer t' } };
    const guard = guardFor({ module: 'support', level: 'EDIT' });
    await expect(guard.canActivate(makeContext(req))).resolves.toBe(true);
    expect(req.user).toMatchObject({ sub: 200023, role: 'ADMIN' });
    expect(req.adminStaff).toMatchObject({ userId: 200023, staffRole: 'SUPPORT_ADMIN' });
  });

  it('allows EDIT to satisfy a READ_ONLY requirement', async () => {
    withRole('SUPPORT_ADMIN');
    const guard = guardFor({ module: 'support', level: 'READ_ONLY' });
    await expect(
      guard.canActivate(makeContext({ headers: { authorization: 'Bearer t' } })),
    ).resolves.toBe(true);
  });

  it('refuses READ_ONLY where EDIT is required', async () => {
    withRole('SUPPORT_ADMIN'); // users: READ_ONLY by default
    const guard = guardFor({ module: 'users', level: 'EDIT' });
    await expect(
      guard.canActivate(makeContext({ headers: { authorization: 'Bearer t' } })),
    ).rejects.toThrow(/full access to Candidates & employers/i);
  });

  it('refuses a module the role does not hold at all', async () => {
    withRole('SUPPORT_ADMIN'); // finance: NONE
    const guard = guardFor({ module: 'finance', level: 'READ_ONLY' });
    await expect(
      guard.canActivate(makeContext({ headers: { authorization: 'Bearer t' } })),
    ).rejects.toThrow(/view access to Subscriptions & revenue/i);
  });

  it('does not leak the caller’s own grant level in the refusal', async () => {
    withRole('FINANCE_ADMIN');
    const guard = guardFor({ module: 'moderation', level: 'EDIT' });
    const err = await guard
      .canActivate(makeContext({ headers: { authorization: 'Bearer t' } }))
      .catch((e: Error) => e);
    // Names what is required, never what the caller holds — otherwise any staff
    // token can enumerate the permission model by probing routes.
    expect((err as Error).message).toBe('Requires full access to Content moderation');
    expect((err as Error).message).not.toMatch(/NONE|FINANCE_ADMIN/);
  });

  it('honours a per-account override that widens access', async () => {
    withRole('SUPPORT_ADMIN', { finance: 'READ_ONLY' });
    const guard = guardFor({ module: 'finance', level: 'READ_ONLY' });
    await expect(
      guard.canActivate(makeContext({ headers: { authorization: 'Bearer t' } })),
    ).resolves.toBe(true);
  });

  it('honours a per-account override that narrows access', async () => {
    withRole('CONTENT_ADMIN', { communications: 'NONE' });
    const guard = guardFor({ module: 'communications', level: 'EDIT' });
    await expect(
      guard.canActivate(makeContext({ headers: { authorization: 'Bearer t' } })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  // The escalation path the whole model depends on closing.
  it('refuses `system` to a sub-admin even when the stored blob grants it', async () => {
    withRole('CONTENT_ADMIN', { system: 'EDIT' });
    const guard = guardFor({ module: 'system', level: 'EDIT' });
    await expect(
      guard.canActivate(makeContext({ headers: { authorization: 'Bearer t' } })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lets a super admin through every module', async () => {
    withRole('SUPER_ADMIN');
    for (const module of ['support', 'moderation', 'finance', 'users', 'verification', 'otp_reveal', 'communications', 'system'] as const) {
      const guard = guardFor({ module, level: 'EDIT' });
      await expect(
        guard.canActivate(makeContext({ headers: { authorization: 'Bearer t' } })),
        module,
      ).resolves.toBe(true);
    }
  });
});

describe('an un-annotated route', () => {
  // Neither allow-by-default (silently open, invisible in review) nor deny-all
  // (takes the console down for the one person who could fix it): a route with
  // no @RequireAdminScope requires system/EDIT, i.e. super admin only.
  it('is reachable by a super admin', async () => {
    m.adminStaff.findUnique.mockResolvedValue({
      staffRole: 'SUPER_ADMIN',
      permissions: null,
      deactivatedAt: null,
    });
    const guard = guardFor(undefined);
    await expect(
      guard.canActivate(makeContext({ headers: { authorization: 'Bearer t' } })),
    ).resolves.toBe(true);
  });

  it('is refused to every assignable staff tier', async () => {
    for (const staffRole of ['SUPPORT_ADMIN', 'CONTENT_ADMIN', 'FINANCE_ADMIN']) {
      m.adminStaff.findUnique.mockResolvedValue({ staffRole, permissions: null, deactivatedAt: null });
      const guard = guardFor(undefined);
      await expect(
        guard.canActivate(makeContext({ headers: { authorization: 'Bearer t' } })),
        staffRole,
      ).rejects.toBeInstanceOf(ForbiddenException);
    }
  });
});
