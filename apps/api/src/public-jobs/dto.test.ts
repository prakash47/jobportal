import { describe, expect, it } from 'vitest';
import {
  ES_MAX_RESULT_WINDOW,
  JobStateQueryDto,
  ListJobsQueryDto,
  MAX_PAGE,
  PAGE_SIZE,
} from './dto';

describe('ListJobsQueryDto', () => {
  it('accepts an empty query — /v1/jobs with no filters is the default feed', () => {
    expect(ListJobsQueryDto.safeParse({}).success).toBe(true);
  });

  it('REJECTS status — the public endpoint must never let a caller ask for DRAFT', () => {
    // searchJobs only DEFAULTS to ACTIVE (`status ?? 'ACTIVE'`), so an
    // accepted-and-forwarded status would surface unpublished documents
    // straight out of the index. .strict() is the first of two defences; the
    // service pins status after the spread as the second.
    const r = ListJobsQueryDto.safeParse({ status: 'DRAFT' });
    expect(r.success).toBe(false);
  });

  it('REJECTS pageSize — page size is fixed server-side at 20', () => {
    expect(ListJobsQueryDto.safeParse({ pageSize: '9999' }).success).toBe(false);
  });

  it('rejects any unknown key rather than ignoring it', () => {
    expect(ListJobsQueryDto.safeParse({ somethingElse: 'x' }).success).toBe(false);
  });

  it('accepts repeated keys as arrays and single values as strings', () => {
    const many = ListJobsQueryDto.safeParse({ skill: ['react', 'go'], city: 'pune' });
    expect(many.success).toBe(true);
    if (many.success) {
      expect(many.data.skill).toEqual(['react', 'go']);
      expect(many.data.city).toBe('pune');
    }
  });

  it('coerces numeric params from their string URL form', () => {
    const r = ListJobsQueryDto.safeParse({ expMin: '2', salaryMin: '1000000', page: '3' });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.expMin).toBe(2);
      expect(r.data.salaryMin).toBe(1000000);
      expect(r.data.page).toBe(3);
    }
  });

  it('rejects a page below 1 and a non-integer page', () => {
    expect(ListJobsQueryDto.safeParse({ page: '0' }).success).toBe(false);
    expect(ListJobsQueryDto.safeParse({ page: '-1' }).success).toBe(false);
    expect(ListJobsQueryDto.safeParse({ page: '1.5' }).success).toBe(false);
  });

  it('bounds page at what Elasticsearch can actually SERVE, not at a guess', () => {
    // from + size must be <= index.max_result_window (10000), and pageSize is
    // fixed at 20, so page 500 is the last servable one. The previous bound of
    // 1000 admitted 500 pages the index always refused — which surfaced as a
    // raw ES exception echoed to anonymous callers instead of this clean 400.
    expect(MAX_PAGE).toBe(500);
    expect(MAX_PAGE).toBe(Math.floor(ES_MAX_RESULT_WINDOW / PAGE_SIZE));
    expect(ListJobsQueryDto.safeParse({ page: String(MAX_PAGE) }).success).toBe(true);
    expect(ListJobsQueryDto.safeParse({ page: String(MAX_PAGE + 1) }).success).toBe(false);
  });

  it('rejects negative experience and salary', () => {
    expect(ListJobsQueryDto.safeParse({ expMin: '-1' }).success).toBe(false);
    expect(ListJobsQueryDto.safeParse({ salaryMin: '-5' }).success).toBe(false);
  });

  it('constrains sort and postedWithin to the values searchJobs understands', () => {
    expect(ListJobsQueryDto.safeParse({ sort: 'recent' }).success).toBe(true);
    expect(ListJobsQueryDto.safeParse({ sort: 'bogus' }).success).toBe(false);
    expect(ListJobsQueryDto.safeParse({ postedWithin: '7' }).success).toBe(true);
    expect(ListJobsQueryDto.safeParse({ postedWithin: '14' }).success).toBe(false);
  });

  it('still accepts emp/mode for URL parity even though they do not filter', () => {
    // Accepted so a URL copied from the website round-trips; documented as
    // non-functional so the app does not ship a filter that does nothing.
    const r = ListJobsQueryDto.safeParse({ emp: 'FULL_TIME', mode: ['REMOTE'] });
    expect(r.success).toBe(true);
  });
});

describe('JobStateQueryDto', () => {
  it('accepts a list of job ids', () => {
    const r = JobStateQueryDto.safeParse({ jobIds: [1, 2, 3] });
    expect(r.success).toBe(true);
  });

  it('requires at least one id and caps the batch at 100', () => {
    expect(JobStateQueryDto.safeParse({ jobIds: [] }).success).toBe(false);
    expect(
      JobStateQueryDto.safeParse({ jobIds: Array.from({ length: 101 }, (_, i) => i + 1) }).success,
    ).toBe(false);
    expect(
      JobStateQueryDto.safeParse({ jobIds: Array.from({ length: 100 }, (_, i) => i + 1) }).success,
    ).toBe(true);
  });

  it('rejects non-positive and non-integer ids', () => {
    expect(JobStateQueryDto.safeParse({ jobIds: [0] }).success).toBe(false);
    expect(JobStateQueryDto.safeParse({ jobIds: [-3] }).success).toBe(false);
    expect(JobStateQueryDto.safeParse({ jobIds: [1.5] }).success).toBe(false);
  });

  it('rejects ids beyond the int4 ceiling — Job.id is a Prisma Int', () => {
    // A larger value makes findMany THROW rather than match nothing, which is
    // a 500 instead of an empty result.
    expect(JobStateQueryDto.safeParse({ jobIds: [2147483647] }).success).toBe(true);
    expect(JobStateQueryDto.safeParse({ jobIds: [2147483648] }).success).toBe(false);
  });

  it('rejects unknown keys', () => {
    expect(JobStateQueryDto.safeParse({ jobIds: [1], userId: 9 }).success).toBe(false);
  });
});
