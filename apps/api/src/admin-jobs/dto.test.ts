import { describe, expect, it } from 'vitest';
import { ListAdminJobsQueryDto, ModerateJobDto } from './dto';

describe('ListAdminJobsQueryDto', () => {
  it('accepts an empty query (the service defaults to the pending queue)', () => {
    expect(ListAdminJobsQueryDto.safeParse({}).success).toBe(true);
  });

  it('transforms the string page Express hands us into a number', () => {
    const parsed = ListAdminJobsQueryDto.parse({ page: '3' });
    expect(parsed.page).toBe(3);
  });

  it.each(['0', '-1', 'abc', '1.5'])('rejects page=%s', (page) => {
    expect(ListAdminJobsQueryDto.safeParse({ page }).success).toBe(false);
  });

  // EXPIRED/CLOSED are lifecycle outcomes, not moderation ones — accepting them
  // would turn the review console into a general job browser.
  it('rejects a status outside the moderation-relevant set', () => {
    expect(ListAdminJobsQueryDto.safeParse({ status: 'EXPIRED' }).success).toBe(false);
  });

  // .strict() — an unexpected key is a caller bug, not something to ignore.
  it('rejects unknown keys', () => {
    expect(ListAdminJobsQueryDto.safeParse({ sort: 'title' }).success).toBe(false);
  });
});

describe('ModerateJobDto', () => {
  it('accepts an approve with no reason', () => {
    expect(ModerateJobDto.safeParse({ decision: 'APPROVE' }).success).toBe(true);
  });

  it('accepts a reject with a reason', () => {
    const r = ModerateJobDto.safeParse({ decision: 'REJECT', reason: 'Salary band missing' });
    expect(r.success).toBe(true);
  });

  // The reason is the ONLY thing the recruiter gets back, so an empty one makes
  // the rejection unactionable. Enforced at the API, not just in the UI.
  it.each([undefined, null, '', '   '])('rejects a REJECT with reason=%p', (reason) => {
    const r = ModerateJobDto.safeParse({ decision: 'REJECT', reason });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.path).toEqual(['reason']);
  });

  it('caps the reason length', () => {
    const r = ModerateJobDto.safeParse({ decision: 'REJECT', reason: 'a'.repeat(1001) });
    expect(r.success).toBe(false);
  });

  it('rejects an unknown decision', () => {
    expect(ModerateJobDto.safeParse({ decision: 'MAYBE' }).success).toBe(false);
  });

  it('rejects unknown keys', () => {
    expect(
      ModerateJobDto.safeParse({ decision: 'APPROVE', notifyRecruiter: false }).success,
    ).toBe(false);
  });
});
