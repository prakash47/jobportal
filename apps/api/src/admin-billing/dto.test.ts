import { describe, expect, it } from 'vitest';
import { GrantSubscriptionDto, UpdateSubscriptionDto } from './dto';

describe('GrantSubscriptionDto', () => {
  it('accepts a well-formed grant', () => {
    expect(
      GrantSubscriptionDto.safeParse({ companyId: 1, planId: 5, reason: 'launch partner' }).success,
    ).toBe(true);
  });

  it('requires a reason — every action here gives away a paid plan', () => {
    expect(GrantSubscriptionDto.safeParse({ companyId: 1, planId: 5 }).success).toBe(false);
  });

  it('rejects a whitespace-only reason', () => {
    expect(
      GrantSubscriptionDto.safeParse({ companyId: 1, planId: 5, reason: '   ' }).success,
    ).toBe(false);
  });

  it('trims the reason it stores', () => {
    const parsed = GrantSubscriptionDto.safeParse({
      companyId: 1,
      planId: 5,
      reason: '  launch partner  ',
    });
    expect(parsed.success && parsed.data.reason).toBe('launch partner');
  });

  it('rejects unknown keys, so a stray field cannot ride along', () => {
    expect(
      GrantSubscriptionDto.safeParse({
        companyId: 1,
        planId: 5,
        reason: 'x',
        status: 'ACTIVE',
      }).success,
    ).toBe(false);
  });

  it.each([0, -1, 1.5])('rejects a non-positive or fractional id (%s)', (id) => {
    expect(GrantSubscriptionDto.safeParse({ companyId: id, planId: 5, reason: 'x' }).success).toBe(
      false,
    );
  });

  // A value above int4 makes Prisma THROW rather than match nothing, which is
  // the bug class that produced 500s on /sadmin/job-postings and /v1/jobs/:slug.
  // Rejecting it here means the endpoint answers 400, not 500.
  it('rejects an id above the int4 ceiling', () => {
    expect(
      GrantSubscriptionDto.safeParse({ companyId: 2_147_483_648, planId: 5, reason: 'x' }).success,
    ).toBe(false);
    expect(
      GrantSubscriptionDto.safeParse({ companyId: 2_147_483_647, planId: 5, reason: 'x' }).success,
    ).toBe(true);
  });
});

describe('UpdateSubscriptionDto', () => {
  it('accepts each of the three actions', () => {
    expect(
      UpdateSubscriptionDto.safeParse({ action: 'CHANGE_PLAN', planId: 6, reason: 'r' }).success,
    ).toBe(true);
    expect(UpdateSubscriptionDto.safeParse({ action: 'EXTEND', days: 30, reason: 'r' }).success).toBe(
      true,
    );
    expect(UpdateSubscriptionDto.safeParse({ action: 'CANCEL', reason: 'r' }).success).toBe(true);
  });

  it('rejects an unknown action', () => {
    expect(UpdateSubscriptionDto.safeParse({ action: 'REFUND', reason: 'r' }).success).toBe(false);
  });

  // The whole point of the discriminated union: "extend 30 days AND change the
  // plan" is not a request this API can express, so it cannot be half-applied.
  it('rejects fields belonging to a different action', () => {
    expect(
      UpdateSubscriptionDto.safeParse({ action: 'EXTEND', days: 30, planId: 6, reason: 'r' })
        .success,
    ).toBe(false);
    expect(
      UpdateSubscriptionDto.safeParse({ action: 'CANCEL', days: 30, reason: 'r' }).success,
    ).toBe(false);
  });

  it('requires the field its own action needs', () => {
    expect(UpdateSubscriptionDto.safeParse({ action: 'EXTEND', reason: 'r' }).success).toBe(false);
    expect(UpdateSubscriptionDto.safeParse({ action: 'CHANGE_PLAN', reason: 'r' }).success).toBe(
      false,
    );
  });

  it.each([0, -5, 1.5, 731])('rejects an out-of-range extension (%s days)', (days) => {
    expect(UpdateSubscriptionDto.safeParse({ action: 'EXTEND', days, reason: 'r' }).success).toBe(
      false,
    );
  });

  it('accepts the maximum single extension of 730 days', () => {
    expect(UpdateSubscriptionDto.safeParse({ action: 'EXTEND', days: 730, reason: 'r' }).success).toBe(
      true,
    );
  });

  it('requires a reason on every action', () => {
    expect(UpdateSubscriptionDto.safeParse({ action: 'CANCEL' }).success).toBe(false);
    expect(UpdateSubscriptionDto.safeParse({ action: 'EXTEND', days: 1 }).success).toBe(false);
    expect(UpdateSubscriptionDto.safeParse({ action: 'CHANGE_PLAN', planId: 1 }).success).toBe(
      false,
    );
  });
});
