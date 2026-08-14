import { describe, expect, it } from 'vitest';
import { CreateReportDto, REPORT_REASONS, REPORT_TARGET_TYPES } from './dto';

// A valid body, spread-and-overridden per case so each test states only what it
// is actually about.
const valid = { targetType: 'JOB', jobId: 123, reason: 'FAKE_OR_SCAM' } as const;

describe('CreateReportDto', () => {
  it('accepts a minimal JOB report with no details', () => {
    const r = CreateReportDto.safeParse(valid);
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.jobId).toBe(123);
      expect(r.data.details).toBeUndefined();
    }
  });

  // The Record-keyed tuples in dto.ts make a MISSING member a compile error;
  // this is the runtime half, proving every member the schema declares is
  // actually accepted by the endpoint rather than merely listed.
  it('accepts every reason the Prisma enum declares', () => {
    for (const reason of REPORT_REASONS) {
      expect(CreateReportDto.safeParse({ ...valid, reason }).success).toBe(true);
    }
    expect(REPORT_REASONS).toHaveLength(6);
  });

  it('accepts every target type the Prisma enum declares', () => {
    expect(REPORT_TARGET_TYPES).toEqual(['JOB']);
  });

  it('rejects an unknown reason', () => {
    expect(CreateReportDto.safeParse({ ...valid, reason: 'BECAUSE' }).success).toBe(false);
  });

  it('rejects an unknown target type', () => {
    expect(CreateReportDto.safeParse({ ...valid, targetType: 'CANDIDATE_PROFILE' }).success).toBe(
      false,
    );
  });

  // .strict() — an unrecognised key must fail rather than be dropped, so a
  // client cannot smuggle `status` or `reviewedById` past the DTO.
  it('rejects unknown keys', () => {
    expect(CreateReportDto.safeParse({ ...valid, status: 'ACTIONED' }).success).toBe(false);
    expect(CreateReportDto.safeParse({ ...valid, reviewedById: 1 }).success).toBe(false);
  });

  it('requires jobId when targetType is JOB, and points the issue at jobId', () => {
    const r = CreateReportDto.safeParse({ targetType: 'JOB', reason: 'OTHER' });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.includes('jobId'))).toBe(true);
    }
  });

  // The int4 ceiling is enforced HERE rather than at the driver: an out-of-range
  // id must be a 400, not the 500 an overflow would produce downstream.
  it('rejects a jobId above the int4 ceiling but accepts the ceiling itself', () => {
    expect(CreateReportDto.safeParse({ ...valid, jobId: 2_147_483_648 }).success).toBe(false);
    expect(CreateReportDto.safeParse({ ...valid, jobId: 2_147_483_647 }).success).toBe(true);
  });

  it('rejects a non-positive, fractional or non-numeric jobId', () => {
    for (const jobId of [0, -1, 1.5, '123', null]) {
      expect(CreateReportDto.safeParse({ ...valid, jobId }).success).toBe(false);
    }
  });

  it('trims details', () => {
    const r = CreateReportDto.safeParse({ ...valid, details: '  this is a scam  ' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.details).toBe('this is a scam');
  });

  // Whitespace-only must land as undefined (→ NULL), not '', so the console has
  // exactly one "no detail given" value to branch on.
  it('turns empty and whitespace-only details into undefined', () => {
    for (const details of ['', '   ', '\n\t ']) {
      const r = CreateReportDto.safeParse({ ...valid, details });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.details).toBeUndefined();
    }
  });

  // Trim happens BEFORE the length check, so padding cannot be used to exceed
  // the cap and 2000 spaces is not a 2000-character report.
  it('applies the 2000-char cap to the TRIMMED value', () => {
    const at = 'a'.repeat(2000);
    expect(CreateReportDto.safeParse({ ...valid, details: at }).success).toBe(true);
    expect(CreateReportDto.safeParse({ ...valid, details: `  ${at}  ` }).success).toBe(true);
    expect(CreateReportDto.safeParse({ ...valid, details: 'a'.repeat(2001) }).success).toBe(false);
    const spaces = CreateReportDto.safeParse({ ...valid, details: ' '.repeat(2001) });
    expect(spaces.success).toBe(true);
    if (spaces.success) expect(spaces.data.details).toBeUndefined();
  });
});
