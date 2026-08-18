import { ConflictException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@jobportal/db', () => ({
  prisma: {
    contentReport: { findUnique: vi.fn(), updateMany: vi.fn() },
    job: { updateMany: vi.fn(), findUnique: vi.fn() },
    profileAuditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
  Prisma: {},
}));

vi.mock('@jobportal/feature-flags', () => ({
  FLAG: { KILL_ADMIN_REPORT_WRITE: 'killswitch.admin_report_write' },
  isFlagEnabled: vi.fn(),
}));

import { prisma } from '@jobportal/db';
import { isFlagEnabled } from '@jobportal/feature-flags';
import { AdminReportsService } from './admin-reports.service';

type Mock = ReturnType<typeof vi.fn>;
const m = prisma as unknown as {
  contentReport: { findUnique: Mock; updateMany: Mock };
  job: { updateMany: Mock; findUnique: Mock };
  profileAuditLog: { create: Mock };
  $transaction: Mock;
};
const flag = isFlagEnabled as unknown as Mock;

const ADMIN = 42;
const REPORT = 7;
const JOB = 123;
const KILL = 'killswitch.admin_report_write';

/** An OPEN report against a live posting — the common queue row. */
function openReport(overrides: Record<string, unknown> = {}) {
  return {
    id: REPORT,
    status: 'OPEN',
    jobId: JOB,
    job: { id: JOB, status: 'ACTIVE', companyId: 900 },
    ...overrides,
  };
}

describe('AdminReportsService', () => {
  let service: AdminReportsService;
  let effects: { fireRemoveSideEffects: Mock };

  beforeEach(() => {
    vi.resetAllMocks();
    m.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => unknown) => fn(prisma));
    m.contentReport.findUnique.mockResolvedValue(openReport());
    m.contentReport.updateMany.mockResolvedValue({ count: 1 });
    m.job.updateMany.mockResolvedValue({ count: 1 });
    m.job.findUnique.mockResolvedValue({ id: JOB, canonicalSlug: 'fake-job-acme-123' });
    m.profileAuditLog.create.mockResolvedValue({});
    flag.mockResolvedValue(false);
    effects = { fireRemoveSideEffects: vi.fn() };
    service = new AdminReportsService(effects as unknown as never);
  });

  // --- the killswitch (L3) -------------------------------------------------

  describe('killswitch.admin_report_write', () => {
    // ⚠ Keyed on the FLAG KEY, never a blanket true/false. `mockResolvedValue(true)`
    // answers true for EVERY key, so such a test passes identically with the
    // emergency stop wired to the wrong flag — the vacuous-killswitch-test class
    // this repo has now shipped twice.
    function killswitch(on: boolean) {
      flag.mockImplementation(async (key: string) => (key === KILL ? on : false));
    }

    it('503s and touches no database at all when ON', async () => {
      killswitch(true);
      await expect(service.update(ADMIN, REPORT, { action: 'CLAIM' })).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      // Read the flag BEFORE any query — not merely before the write.
      expect(m.contentReport.findUnique).not.toHaveBeenCalled();
      expect(m.$transaction).not.toHaveBeenCalled();
      expect(m.profileAuditLog.create).not.toHaveBeenCalled();
    });

    it('503s a takedown and leaves the posting live when ON', async () => {
      killswitch(true);
      await expect(
        service.update(ADMIN, REPORT, { action: 'ACTION', closeJob: true }),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(m.job.updateMany).not.toHaveBeenCalled();
      expect(effects.fireRemoveSideEffects).not.toHaveBeenCalled();
    });

    it('consults exactly the admin_report_write key', async () => {
      killswitch(false);
      await service.update(ADMIN, REPORT, { action: 'CLAIM' });
      expect(flag.mock.calls.map((c) => c[0])).toContain(KILL);
    });

    // Wiring the guard to any OTHER key must not stop the write. Fails if the
    // service reads the wrong constant.
    it('is not gated by a different killswitch', async () => {
      flag.mockImplementation(async (key: string) => key === 'killswitch.admin_job_delete');
      await service.update(ADMIN, REPORT, { action: 'CLAIM' });
      expect(m.contentReport.updateMany).toHaveBeenCalled();
    });

    // ⚠ POLARITY. This is a killswitch (seeded OFF, throw on `enabled`), NOT the
    // intake toggle `moderation.reports.enabled` (seeded ON, throw on
    // `!enabled`). Inverting the guard would make the console work only while
    // the emergency stop was pulled. Pins the direction explicitly.
    it('permits the write when the killswitch is OFF', async () => {
      killswitch(false);
      await expect(service.update(ADMIN, REPORT, { action: 'CLAIM' })).resolves.toMatchObject({
        status: 'REVIEWING',
      });
    });

    // The admin queue must survive intake being switched off — staff still have
    // to drain rows already filed.
    it('is not gated by moderation.reports.enabled being off', async () => {
      flag.mockImplementation(async (key: string) => {
        if (key === 'moderation.reports.enabled') return false;
        return false;
      });
      await expect(service.update(ADMIN, REPORT, { action: 'CLAIM' })).resolves.toBeDefined();
      expect(flag.mock.calls.map((c) => c[0])).not.toContain('moderation.reports.enabled');
    });
  });

  // --- lookup --------------------------------------------------------------

  it('404s an unknown report', async () => {
    m.contentReport.findUnique.mockResolvedValue(null);
    await expect(service.update(ADMIN, REPORT, { action: 'CLAIM' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(m.contentReport.updateMany).not.toHaveBeenCalled();
  });

  // reporterIp is abuse-triage data no surface may render, and `details` is the
  // reporter's untrusted prose, which must never be able to reach a
  // ProfileAuditLog diff. Both are cut at the SELECT rather than hidden
  // downstream — the treatment GSTIN and PAN already get.
  //
  // ⚠ Pinned POSITIVELY, on the exact key set. The first version of this test
  // read `...?.select ?? {}` and asserted `.not.toHaveProperty(...)`, which an
  // empty object satisfies for free — so it passed in precisely the case it
  // existed to catch. Verified: swapping `select:` for `include:` in the
  // service (which loads every scalar column, reporterIp and details included)
  // left all 37 tests in this file green. An exact-equality assertion fails on
  // a removed projection AND on a newly added sensitive column.
  it('reads only the four non-sensitive columns — never the IP or the free text', async () => {
    await service.update(ADMIN, REPORT, { action: 'CLAIM' });
    const arg = m.contentReport.findUnique.mock.calls[0]?.[0];
    expect(arg).toBeDefined();
    expect(Object.keys(arg.select ?? {}).sort()).toEqual(['id', 'job', 'jobId', 'status']);
    expect(arg).not.toHaveProperty('include');
  });

  // --- CLAIM ---------------------------------------------------------------

  describe('CLAIM', () => {
    it('moves OPEN to REVIEWING', async () => {
      const res = await service.update(ADMIN, REPORT, { action: 'CLAIM' });
      expect(res).toEqual({ id: REPORT, status: 'REVIEWING', jobClosed: false });
    });

    // REVIEWING means "somebody has this", never "X has this" — there is no
    // assignee column in this product. Writing reviewedById on a claim would
    // fabricate an assignment the schema reserves for a terminal decision.
    it('writes no reviewer, no timestamp and no note', async () => {
      await service.update(ADMIN, REPORT, { action: 'CLAIM' });
      const data = m.contentReport.updateMany.mock.calls[0]?.[0]?.data;
      expect(data).toEqual({ status: 'REVIEWING' });
    });

    // Picking a report up is reversible bookkeeping, not a ruling. The audit
    // table records which way a moderator DECIDED.
    it('writes no audit row', async () => {
      await service.update(ADMIN, REPORT, { action: 'CLAIM' });
      expect(m.profileAuditLog.create).not.toHaveBeenCalled();
    });

    it('409s a report that is already REVIEWING', async () => {
      m.contentReport.findUnique.mockResolvedValue(openReport({ status: 'REVIEWING' }));
      await expect(service.update(ADMIN, REPORT, { action: 'CLAIM' })).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(m.contentReport.updateMany).not.toHaveBeenCalled();
    });

    // Claiming a decided report would silently reopen it.
    it.each(['ACTIONED', 'DISMISSED'])('409s a report that is already %s', async (status) => {
      m.contentReport.findUnique.mockResolvedValue(openReport({ status }));
      await expect(service.update(ADMIN, REPORT, { action: 'CLAIM' })).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  // --- ACTION / DISMISS ----------------------------------------------------

  describe('decisions', () => {
    it.each([
      ['ACTION', 'ACTIONED', 'CONTENT_REPORT_ACTIONED'],
      ['DISMISS', 'DISMISSED', 'CONTENT_REPORT_DISMISSED'],
    ])('%s writes %s and audits as %s', async (action, status, auditAction) => {
      await service.update(ADMIN, REPORT, {
        action,
        note: 'checked the company registration',
      } as never);
      expect(m.contentReport.updateMany.mock.calls[0]?.[0]?.data).toMatchObject({
        status,
        reviewedById: ADMIN,
        resolutionNote: 'checked the company registration',
      });
      expect(m.profileAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId: ADMIN, action: auditAction }),
        }),
      );
    });

    it.each(['OPEN', 'REVIEWING'])('accepts a decision from %s', async (status) => {
      m.contentReport.findUnique.mockResolvedValue(openReport({ status }));
      await expect(
        service.update(ADMIN, REPORT, { action: 'DISMISS', note: 'looks legitimate' }),
      ).resolves.toMatchObject({ status: 'DISMISSED' });
    });

    it.each(['ACTIONED', 'DISMISSED'])('409s a decision on an already-%s report', async (status) => {
      m.contentReport.findUnique.mockResolvedValue(openReport({ status }));
      await expect(
        service.update(ADMIN, REPORT, { action: 'DISMISS', note: 'x' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(m.contentReport.updateMany).not.toHaveBeenCalled();
    });

    it('stores a null note when ACTION supplies none', async () => {
      await service.update(ADMIN, REPORT, { action: 'ACTION' });
      expect(m.contentReport.updateMany.mock.calls[0]?.[0]?.data).toMatchObject({
        resolutionNote: null,
      });
    });

    // ⚠ THE compare-and-swap assertion. The guard must pin the EXACT status the
    // transaction observed, not `status: { in: ['OPEN','REVIEWING'] }`. With an
    // `in` guard a concurrent CLAIM moving OPEN → REVIEWING between the read and
    // the write still matches, so the write succeeds while the audit row records
    // `before: 'OPEN'` — a durable record of a transition that never happened.
    // That read-modify-write-across-the-lock-boundary class was found in the
    // billing console's review; this is what stops it recurring here.
    it('guards the update on the exact status it read, not a set', async () => {
      m.contentReport.findUnique.mockResolvedValue(openReport({ status: 'REVIEWING' }));
      await service.update(ADMIN, REPORT, { action: 'ACTION' });
      expect(m.contentReport.updateMany).toHaveBeenCalledWith({
        where: { id: REPORT, status: 'REVIEWING' },
        data: expect.objectContaining({ status: 'ACTIONED' }),
      });
    });

    // The admin's own words are the one part of the record a later reader
    // cannot reconstruct from the data. Asserted explicitly because the spread
    // that writes it is conditional: deleting `...(note ? { note } : {})`
    // entirely left every other test in this file green.
    it('records the admin note in the audit diff, and omits the key when there is none', async () => {
      await service.update(ADMIN, REPORT, { action: 'DISMISS', note: 'listing checks out' });
      expect(m.profileAuditLog.create.mock.calls[0]?.[0]?.data?.diff).toMatchObject({
        note: 'listing checks out',
      });

      vi.clearAllMocks();
      m.contentReport.findUnique.mockResolvedValue(openReport());
      m.contentReport.updateMany.mockResolvedValue({ count: 1 });
      m.profileAuditLog.create.mockResolvedValue({});
      await service.update(ADMIN, REPORT, { action: 'ACTION' });
      expect(m.profileAuditLog.create.mock.calls[0]?.[0]?.data?.diff).not.toHaveProperty('note');
    });

    // Never the REPORTER's words — only the admin's. The schema comment on
    // CONTENT_REPORT_ACTIONED forbids `details` reaching the diff, and the
    // in-transaction read does not even select it.
    it('never puts the reporter free text in the audit diff', async () => {
      await service.update(ADMIN, REPORT, { action: 'ACTION', note: 'confirmed scam' });
      const diff = m.profileAuditLog.create.mock.calls[0]?.[0]?.data?.diff;
      expect(diff).not.toHaveProperty('details');
      expect(JSON.stringify(diff)).not.toContain('registration fee');
    });

    it('records the observed transition in the audit diff', async () => {
      m.contentReport.findUnique.mockResolvedValue(openReport({ status: 'REVIEWING' }));
      await service.update(ADMIN, REPORT, { action: 'ACTION' });
      expect(m.profileAuditLog.create.mock.calls[0]?.[0]?.data?.diff).toMatchObject({
        reportId: REPORT,
        jobId: JOB,
        companyId: 900,
        status: { before: 'REVIEWING', after: 'ACTIONED' },
      });
    });

    it('409s and audits nothing when another admin wins the race', async () => {
      m.contentReport.updateMany.mockResolvedValue({ count: 0 });
      await expect(
        service.update(ADMIN, REPORT, { action: 'DISMISS', note: 'x' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(m.profileAuditLog.create).not.toHaveBeenCalled();
    });
  });

  // --- the takedown --------------------------------------------------------

  describe('takedown', () => {
    it('closes a live posting and audits it separately', async () => {
      const res = await service.update(ADMIN, REPORT, { action: 'ACTION', closeJob: true });
      expect(m.job.updateMany).toHaveBeenCalledWith({
        where: { id: JOB, status: 'ACTIVE' },
        data: { status: 'CLOSED' },
      });
      expect(res.jobClosed).toBe(true);
      // TWO audit rows: the ruling and the act. "What has staff done to this
      // employer's postings" must be answerable without knowing a report caused it.
      const actions = m.profileAuditLog.create.mock.calls.map((c) => c[0]?.data?.action);
      expect(actions).toContain('JOB_CLOSED_BY_ADMIN');
      expect(actions).toContain('CONTENT_REPORT_ACTIONED');
    });

    it('de-indexes the closed posting from Elasticsearch', async () => {
      await service.update(ADMIN, REPORT, { action: 'ACTION', closeJob: true });
      // Without this the posting keeps appearing in search and in job-alert
      // emails after staff have taken it down — a searchable ghost.
      expect(effects.fireRemoveSideEffects).toHaveBeenCalledWith(
        expect.objectContaining({ id: JOB, canonicalSlug: 'fake-job-acme-123' }),
      );
    });

    it('does not touch the posting or fire side effects unless asked', async () => {
      await service.update(ADMIN, REPORT, { action: 'ACTION' });
      expect(m.job.updateMany).not.toHaveBeenCalled();
      expect(effects.fireRemoveSideEffects).not.toHaveBeenCalled();
      expect(
        m.profileAuditLog.create.mock.calls.map((c) => c[0]?.data?.action),
      ).not.toContain('JOB_CLOSED_BY_ADMIN');
    });

    it('never fires side effects on a dismissal', async () => {
      await service.update(ADMIN, REPORT, { action: 'DISMISS', note: 'legitimate posting' });
      expect(effects.fireRemoveSideEffects).not.toHaveBeenCalled();
    });

    it.each(['CLOSED', 'EXPIRED', 'DRAFT', 'PENDING_MODERATION'])(
      '409s a takedown of a %s posting and decides nothing',
      async (status) => {
        m.contentReport.findUnique.mockResolvedValue(
          openReport({ job: { id: JOB, status, companyId: 900 } }),
        );
        await expect(
          service.update(ADMIN, REPORT, { action: 'ACTION', closeJob: true }),
        ).rejects.toBeInstanceOf(ConflictException);
        // The report must stay undecided so the admin can retry without the box.
        expect(m.contentReport.updateMany).not.toHaveBeenCalled();
      },
    );

    it('409s a takedown when the report names no posting', async () => {
      m.contentReport.findUnique.mockResolvedValue(openReport({ jobId: null, job: null }));
      await expect(
        service.update(ADMIN, REPORT, { action: 'ACTION', closeJob: true }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(m.contentReport.updateMany).not.toHaveBeenCalled();
    });

    // ⚠ Prisma commits on RETURN and rolls back only on THROW. If the job close
    // loses its race the report row has ALREADY been written in this
    // transaction, so the service must throw — returning a sentinel would commit
    // a report marked "upheld, posting taken down" while the posting stayed live.
    it('throws rather than committing a half-done takedown', async () => {
      m.job.updateMany.mockResolvedValue({ count: 0 });
      await expect(
        service.update(ADMIN, REPORT, { action: 'ACTION', closeJob: true }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(effects.fireRemoveSideEffects).not.toHaveBeenCalled();
    });

    it('does not fire side effects if the closed row vanishes before the re-read', async () => {
      m.job.findUnique.mockResolvedValue(null);
      await expect(
        service.update(ADMIN, REPORT, { action: 'ACTION', closeJob: true }),
      ).resolves.toMatchObject({ jobClosed: true });
      expect(effects.fireRemoveSideEffects).not.toHaveBeenCalled();
    });
  });

  // --- transaction integrity ----------------------------------------------

  // The outer $transaction mock passes `prisma` itself as `tx`, which makes every
  // "happens inside the transaction" assertion above VACUOUS — they would pass
  // with the writes moved entirely outside the callback. This block uses a
  // DISTINCT tx client so the assertions actually mean something. The same trap
  // was found in admin-jobs, where an audit-in-transaction test proved nothing.
  describe('writes commit inside the transaction', () => {
    let tx: {
      contentReport: { findUnique: Mock; updateMany: Mock };
      job: { updateMany: Mock };
      profileAuditLog: { create: Mock };
    };

    beforeEach(() => {
      tx = {
        contentReport: {
          findUnique: vi.fn().mockResolvedValue(openReport()),
          updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        },
        job: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
        profileAuditLog: { create: vi.fn().mockResolvedValue({}) },
      };
      m.$transaction.mockImplementation(async (fn: (c: typeof tx) => unknown) => fn(tx));
    });

    it('reads, flips, closes and audits on the transaction client', async () => {
      await service.update(ADMIN, REPORT, { action: 'ACTION', closeJob: true });
      // The authoritative read is in the transaction too — that is what makes
      // the compare-and-swap sound.
      expect(tx.contentReport.findUnique).toHaveBeenCalled();
      expect(tx.contentReport.updateMany).toHaveBeenCalled();
      expect(tx.job.updateMany).toHaveBeenCalled();
      expect(tx.profileAuditLog.create).toHaveBeenCalledTimes(2);
      // Nothing leaked onto the base client.
      expect(m.contentReport.updateMany).not.toHaveBeenCalled();
      expect(m.job.updateMany).not.toHaveBeenCalled();
      expect(m.profileAuditLog.create).not.toHaveBeenCalled();
    });

    // Deliberately OUTSIDE: fire-and-forget ES/Cloudflare work must not hold a
    // database transaction open, and the row it reads must be the committed one.
    it('re-reads the job for side effects on the base client, after commit', async () => {
      await service.update(ADMIN, REPORT, { action: 'ACTION', closeJob: true });
      expect(m.job.findUnique).toHaveBeenCalledWith({ where: { id: JOB } });
      expect(effects.fireRemoveSideEffects).toHaveBeenCalled();
    });
  });
});
