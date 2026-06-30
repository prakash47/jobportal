import { BadRequestException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@jobportal/db', () => ({
  prisma: {
    companyKyc: { count: vi.fn(), findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    profileAuditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
  Prisma: {},
}));

import { prisma } from '@jobportal/db';
import { AdminKycService } from './admin-kyc.service';

const m = prisma as unknown as {
  companyKyc: {
    count: ReturnType<typeof vi.fn>;
    findMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  profileAuditLog: { create: ReturnType<typeof vi.fn> };
  $transaction: ReturnType<typeof vi.fn>;
};

const fakeStorage = { getSignedDownloadUrl: vi.fn() };
// Recruiter notification producer — fire-and-log after a KYC decision.
const fakeNotifications = {
  notifyKycDecision: vi.fn().mockResolvedValue(undefined),
} as { notifyKycDecision: ReturnType<typeof vi.fn> };

function detailRow(over: Record<string, unknown> = {}) {
  return {
    companyId: 7,
    status: 'PENDING',
    legalName: 'Acme Pvt Ltd',
    gstNumber: '27AAACA1234A1Z5',
    panNumber: 'AAACA1234A',
    registrationNumber: null,
    authorizedPersonName: 'Asha',
    authorizedPersonDesignation: 'Director',
    authorizedPersonIdType: 'PAN',
    submittedAt: new Date('2026-06-30T00:00:00Z'),
    reviewedAt: null,
    reviewedById: null,
    rejectionReason: null,
    company: { id: 7, name: 'Acme', slug: 'acme', logoUrl: null, websiteUrl: null },
    documents: [
      {
        id: 1,
        docType: 'BUSINESS_REGISTRATION',
        originalFilename: 'r.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 10,
        scanStatus: 'CLEAN',
        uploadedAt: new Date('2026-06-30T00:00:00Z'),
        r2Key: 'kyc-documents/7/business_registration-1-x.pdf',
      },
    ],
    ...over,
  };
}

describe('AdminKycService', () => {
  let service: AdminKycService;

  beforeEach(() => {
    vi.resetAllMocks();
    fakeStorage.getSignedDownloadUrl.mockResolvedValue('https://signed.example/doc');
    m.profileAuditLog.create.mockResolvedValue({});
    m.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => unknown) => fn(prisma));
    fakeNotifications.notifyKycDecision.mockResolvedValue(undefined);
    service = new AdminKycService(fakeStorage as never, fakeNotifications as never);
  });

  describe('listKyc', () => {
    it('masks the GSTIN to its last 4 chars and counts live documents', async () => {
      m.companyKyc.count.mockResolvedValue(1);
      m.companyKyc.findMany.mockResolvedValue([
        {
          companyId: 7,
          status: 'PENDING',
          legalName: 'Acme',
          gstNumber: '27AAACA1234A1Z5',
          submittedAt: new Date(),
          reviewedAt: null,
          company: { name: 'Acme', slug: 'acme' },
          documents: [{ id: 1 }, { id: 2 }],
        },
      ]);

      const res = await service.listKyc({});
      expect(res.total).toBe(1);
      expect(res.items[0]?.documentCount).toBe(2);
      expect(res.items[0]?.gstNumberMasked).toMatch(/^•+A1Z5$/);
      expect(res.items[0]?.gstNumberMasked).not.toContain('AAACA');
    });

    it('defaults to all submitted records (excludes NOT_SUBMITTED)', async () => {
      m.companyKyc.count.mockResolvedValue(0);
      m.companyKyc.findMany.mockResolvedValue([]);
      await service.listKyc({});
      const arg = m.companyKyc.findMany.mock.calls[0]?.[0] as { where: { status: unknown } };
      expect(arg.where).toEqual({ status: { not: 'NOT_SUBMITTED' } });
    });

    it('filters by an explicit status', async () => {
      m.companyKyc.count.mockResolvedValue(0);
      m.companyKyc.findMany.mockResolvedValue([]);
      await service.listKyc({ status: 'PENDING' });
      const arg = m.companyKyc.findMany.mock.calls[0]?.[0] as { where: { status: unknown } };
      expect(arg.where).toEqual({ status: 'PENDING' });
    });
  });

  describe('getKycDetail', () => {
    it('returns full identifiers and a signed URL per document', async () => {
      m.companyKyc.findUnique.mockResolvedValue(detailRow());
      const detail = await service.getKycDetail(7);
      expect(detail.gstNumber).toBe('27AAACA1234A1Z5'); // full (unmasked) for the reviewer
      expect(detail.documents[0]?.downloadUrl).toBe('https://signed.example/doc');
      expect(fakeStorage.getSignedDownloadUrl).toHaveBeenCalledWith(
        'kyc-documents/7/business_registration-1-x.pdf',
        15 * 60,
      );
    });

    it('throws NotFound when there is no record', async () => {
      m.companyKyc.findUnique.mockResolvedValue(null);
      await expect(service.getKycDetail(7)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('review', () => {
    it('approves a PENDING submission → VERIFIED with an audit row', async () => {
      m.companyKyc.findUnique
        .mockResolvedValueOnce({ status: 'PENDING' }) // status guard
        .mockResolvedValueOnce(detailRow({ status: 'VERIFIED' })); // returned detail
      m.companyKyc.update.mockResolvedValue({});

      await service.review(1, 7, { decision: 'APPROVE' });

      const updateArg = m.companyKyc.update.mock.calls[0]?.[0] as {
        data: { status: string; reviewedById: number; rejectionReason: string | null };
      };
      expect(updateArg.data.status).toBe('VERIFIED');
      expect(updateArg.data.reviewedById).toBe(1);
      expect(updateArg.data.rejectionReason).toBeNull();
      const auditArg = m.profileAuditLog.create.mock.calls[0]?.[0] as { data: { action: string } };
      expect(auditArg.data.action).toBe('KYC_APPROVED');
      // Recruiter-side notification fired after the decision committed.
      expect(fakeNotifications.notifyKycDecision).toHaveBeenCalledWith({
        companyId: 7,
        decision: 'VERIFIED',
        rejectionReason: null,
      });
    });

    it('rejects a PENDING submission → REJECTED, persisting the reason', async () => {
      m.companyKyc.findUnique
        .mockResolvedValueOnce({ status: 'PENDING' })
        .mockResolvedValueOnce(detailRow({ status: 'REJECTED', rejectionReason: 'GST mismatch' }));
      m.companyKyc.update.mockResolvedValue({});

      await service.review(1, 7, { decision: 'REJECT', reason: 'GST mismatch' });

      const updateArg = m.companyKyc.update.mock.calls[0]?.[0] as {
        data: { status: string; rejectionReason: string };
      };
      expect(updateArg.data.status).toBe('REJECTED');
      expect(updateArg.data.rejectionReason).toBe('GST mismatch');
      const auditArg = m.profileAuditLog.create.mock.calls[0]?.[0] as { data: { action: string } };
      expect(auditArg.data.action).toBe('KYC_REJECTED');
      expect(fakeNotifications.notifyKycDecision).toHaveBeenCalledWith({
        companyId: 7,
        decision: 'REJECTED',
        rejectionReason: 'GST mismatch',
      });
    });

    it('still resolves when the recruiter notification producer rejects (fire-and-log)', async () => {
      m.companyKyc.findUnique
        .mockResolvedValueOnce({ status: 'PENDING' })
        .mockResolvedValueOnce(detailRow({ status: 'VERIFIED' }));
      m.companyKyc.update.mockResolvedValue({});
      // Notification is fire-and-log after the decision commits — a failure must
      // NOT roll back or 5xx the admin's review.
      fakeNotifications.notifyKycDecision.mockRejectedValueOnce(new Error('db down'));

      await expect(service.review(1, 7, { decision: 'APPROVE' })).resolves.toBeDefined();
    });

    it('refuses to review a non-PENDING submission', async () => {
      m.companyKyc.findUnique.mockResolvedValue({ status: 'VERIFIED' });
      await expect(service.review(1, 7, { decision: 'APPROVE' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(m.companyKyc.update).not.toHaveBeenCalled();
    });

    it('throws NotFound when there is no record to review', async () => {
      m.companyKyc.findUnique.mockResolvedValue(null);
      await expect(service.review(1, 7, { decision: 'APPROVE' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
