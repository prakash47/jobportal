import { describe, expect, it } from 'vitest';
import { AcceptInviteDto, InviteUserDto, UpdateUserDto } from './dto';

describe('InviteUserDto', () => {
  it('accepts a minimal invite, lowercases email, defaults role to MEMBER', () => {
    const r = InviteUserDto.safeParse({ email: 'New.Person@Acme.COM' });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.email).toBe('new.person@acme.com');
      expect(r.data.companyRole).toBe('MEMBER');
    }
  });

  it('rejects an invalid email', () => {
    expect(InviteUserDto.safeParse({ email: 'nope' }).success).toBe(false);
  });

  it('rejects unknown top-level keys (strict)', () => {
    expect(InviteUserDto.safeParse({ email: 'a@b.com', bogus: 1 }).success).toBe(false);
  });

  it('rejects an unknown permission module (strict)', () => {
    expect(
      InviteUserDto.safeParse({ email: 'a@b.com', permissions: { billing: 'EDIT' } }).success,
    ).toBe(false);
  });

  it('rejects an invalid permission level', () => {
    expect(
      InviteUserDto.safeParse({ email: 'a@b.com', permissions: { jobs: 'ALL' } }).success,
    ).toBe(false);
  });

  it('accepts a partial permission override with an explicit role', () => {
    const r = InviteUserDto.safeParse({
      email: 'a@b.com',
      companyRole: 'ADMIN',
      permissions: { jobs: 'READ_ONLY' },
    });
    expect(r.success).toBe(true);
  });
});

describe('UpdateUserDto', () => {
  it('requires at least one of role / permissions', () => {
    expect(UpdateUserDto.safeParse({}).success).toBe(false);
  });

  it('accepts a role-only update', () => {
    expect(UpdateUserDto.safeParse({ companyRole: 'ADMIN' }).success).toBe(true);
  });

  it('accepts a permissions-only update', () => {
    expect(UpdateUserDto.safeParse({ permissions: { applicants: 'NONE' } }).success).toBe(true);
  });

  it('rejects unknown keys', () => {
    expect(UpdateUserDto.safeParse({ companyRole: 'ADMIN', x: 1 }).success).toBe(false);
  });
});

describe('AcceptInviteDto', () => {
  it('accepts a valid accept payload', () => {
    expect(
      AcceptInviteDto.safeParse({ token: 't', name: 'Sam', password: 'Sup3rSecret!' }).success,
    ).toBe(true);
  });

  it('rejects a weak password', () => {
    expect(
      AcceptInviteDto.safeParse({ token: 't', name: 'Sam', password: 'weak' }).success,
    ).toBe(false);
  });

  it('rejects a blank token or name', () => {
    expect(
      AcceptInviteDto.safeParse({ token: '', name: 'Sam', password: 'Sup3rSecret!' }).success,
    ).toBe(false);
    expect(
      AcceptInviteDto.safeParse({ token: 't', name: '', password: 'Sup3rSecret!' }).success,
    ).toBe(false);
  });
});
