import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@jobportal/feature-flags', () => ({ isFlagEnabled: vi.fn() }));
vi.mock('@jobportal/db', () => ({
  prisma: {
    recruiter: { findUnique: vi.fn() },
    companyKyc: { findUnique: vi.fn(), upsert: vi.fn(), create: vi.fn(), update: vi.fn() },
    kycDocument: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    profileAuditLog: { create: vi.fn() },
    $transaction: vi.fn(),
    $queryRaw: vi.fn(),
  },
  Prisma: {},
}));

import { prisma } from '@jobportal/db';
import { isFlagEnabled } from '@jobportal/feature-flags';
import { RecruiterKycService } from './recruiter-kyc.service';

const mockedFlag = isFlagEnabled as unknown as ReturnType<typeof vi.fn>;
const m = prisma as unknown as {
  recruiter: { findUnique: ReturnType<typeof vi.fn> };
  companyKyc: {
    findUnique: ReturnType<typeof vi.fn>;
    upsert: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  kycDocument: {
    findFirst: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  profileAuditLog: { create: ReturnType<typeof vi.fn> };
  $transaction: ReturnType<typeof vi.fn>;
  $queryRaw: ReturnType<typeof vi.fn>;
};

const fakeStorage = {
  putObject: vi.fn(),
  getSignedDownloadUrl: vi.fn(),
  deleteObject: vi.fn(),
};
const fakeClamav = { scan: vi.fn() };

const PDF = { originalname: 'reg.pdf', mimetype: 'application/pdf', size: 2048, buffer: Buffer.from('x') };

function kycRow(over: Record<string, unknown> = {}) {
  return {
    id: 5,
    status: 'NOT_SUBMITTED',
    legalName: null,
    gstNumber: null,
    panNumber: null,
    registrationNumber: null,
    authorizedPersonName: null,
    authorizedPersonDesignation: null,
    authorizedPersonIdType: null,
    submittedAt: null,
    reviewedAt: null,
    rejectionReason: null,
    documents: [],
    ...over,
  };
}

describe('RecruiterKycService', () => {
  let service: RecruiterKycService;

  beforeEach(() => {
    vi.resetAllMocks();
    mockedFlag.mockResolvedValue(false); // killswitch OFF → feature live
    fakeClamav.scan.mockResolvedValue('CLEAN');
    fakeStorage.putObject.mockResolvedValue({});
    fakeStorage.getSignedDownloadUrl.mockResolvedValue('https://signed.example/doc');
    fakeStorage.deleteObject.mockResolvedValue(undefined);
    m.recruiter.findUnique.mockResolvedValue({ companyId: 7 });
    m.companyKyc.upsert.mockResolvedValue({ id: 5 });
    m.profileAuditLog.create.mockResolvedValue({});
    m.$queryRaw.mockResolvedValue([]);
    m.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => unknown) => fn(prisma));
    service = new RecruiterKycService(fakeStorage as never, fakeClamav as never);
  });

  describe('killswitch (L3)', () => {
    it('blocks saveKyc when killswitch.recruiter_kyc is ON', async () => {
      mockedFlag.mockResolvedValue(true);
      await expect(service.saveKyc(42, { legalName: 'Acme' })).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      expect(m.companyKyc.upsert).not.toHaveBeenCalled();
    });

    it('blocks uploadDocument when the killswitch is ON', async () => {
      mockedFlag.mockResolvedValue(true);
      await expect(
        service.uploadDocument(42, 'BUSINESS_REGISTRATION', PDF),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(fakeStorage.putObject).not.toHaveBeenCalled();
    });
  });

  describe('getKyc', () => {
    it('returns a NOT_SUBMITTED default when no row exists', async () => {
      m.companyKyc.findUnique.mockResolvedValue(null);
      const v = await service.getKyc(42);
      expect(v.status).toBe('NOT_SUBMITTED');
      expect(v.documents).toEqual([]);
      expect(v.gstNumber).toBeNull();
    });

    it('maps an existing row and its live documents', async () => {
      m.companyKyc.findUnique.mockResolvedValue(
        kycRow({
          status: 'PENDING',
          legalName: 'Acme Pvt Ltd',
          gstNumber: '27AAACA1234A1Z5',
          documents: [
            {
              id: 1,
              docType: 'BUSINESS_REGISTRATION',
              originalFilename: 'r.pdf',
              mimeType: 'application/pdf',
              sizeBytes: 10,
              scanStatus: 'CLEAN',
              uploadedAt: new Date('2026-06-30T00:00:00Z'),
            },
          ],
        }),
      );
      const v = await service.getKyc(42);
      expect(v.status).toBe('PENDING');
      expect(v.legalName).toBe('Acme Pvt Ltd');
      expect(v.documents).toHaveLength(1);
      expect(v.documents[0]?.docType).toBe('BUSINESS_REGISTRATION');
    });
  });

  describe('saveKyc', () => {
    it('upserts identifiers and converts an empty string to null', async () => {
      m.companyKyc.upsert.mockResolvedValue({});
      m.companyKyc.findUnique.mockResolvedValue(null);
      await service.saveKyc(42, { legalName: 'Acme', gstNumber: '' });
      const arg = m.companyKyc.upsert.mock.calls[0]?.[0] as {
        create: { companyId: number; gstNumber: unknown };
        update: { legalName: string; gstNumber: unknown };
      };
      expect(arg.create.companyId).toBe(7);
      expect(arg.update.legalName).toBe('Acme');
      expect(arg.update.gstNumber).toBeNull();
    });
  });

  describe('assertEditable guard', () => {
    it('blocks saveKyc while the submission is PENDING (under review)', async () => {
      m.companyKyc.findUnique.mockResolvedValue({ status: 'PENDING' });
      await expect(service.saveKyc(42, { legalName: 'X' })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(m.companyKyc.upsert).not.toHaveBeenCalled();
    });

    it('blocks uploadDocument once the company is VERIFIED', async () => {
      m.companyKyc.findUnique.mockResolvedValue({ status: 'VERIFIED' });
      await expect(
        service.uploadDocument(42, 'BUSINESS_REGISTRATION', PDF),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(fakeStorage.putObject).not.toHaveBeenCalled();
    });

    it('blocks deleteDocument while PENDING', async () => {
      m.companyKyc.findUnique.mockResolvedValue({ status: 'PENDING' });
      await expect(service.deleteDocument(42, 9)).rejects.toBeInstanceOf(BadRequestException);
      expect(m.kycDocument.update).not.toHaveBeenCalled();
    });
  });

  describe('uploadDocument', () => {
    it('rejects a bad MIME without touching storage', async () => {
      await expect(
        service.uploadDocument(42, 'BUSINESS_REGISTRATION', { ...PDF, mimetype: 'application/zip' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(fakeStorage.putObject).not.toHaveBeenCalled();
    });

    it('rejects an INFECTED file before it reaches storage', async () => {
      fakeClamav.scan.mockResolvedValue('INFECTED');
      await expect(
        service.uploadDocument(42, 'BUSINESS_REGISTRATION', PDF),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(fakeStorage.putObject).not.toHaveBeenCalled();
    });

    it('stores the object, creates the row, and writes an audit entry', async () => {
      m.companyKyc.findUnique.mockResolvedValue(kycRow());
      m.kycDocument.findFirst.mockResolvedValue(null);
      m.kycDocument.create.mockResolvedValue({ id: 9, originalFilename: 'reg.pdf', sizeBytes: 2048 });

      await service.uploadDocument(42, 'BUSINESS_REGISTRATION', PDF);

      expect(fakeStorage.putObject).toHaveBeenCalledTimes(1);
      const createArg = m.kycDocument.create.mock.calls[0]?.[0] as {
        data: { docType: string; scanStatus: string; uploadedById: number };
      };
      expect(createArg.data.docType).toBe('BUSINESS_REGISTRATION');
      expect(createArg.data.scanStatus).toBe('CLEAN');
      expect(createArg.data.uploadedById).toBe(42);
      const auditArg = m.profileAuditLog.create.mock.calls[0]?.[0] as { data: { action: string } };
      expect(auditArg.data.action).toBe('KYC_DOCUMENT_UPLOAD');
    });

    it('supersedes (soft-deletes + removes) the previous active doc of the same type', async () => {
      m.companyKyc.findUnique.mockResolvedValue(kycRow());
      m.kycDocument.findFirst.mockResolvedValue({
        id: 3,
        r2Key: 'kyc-documents/7/business_registration-1-old.pdf',
      });
      m.kycDocument.create.mockResolvedValue({ id: 9, originalFilename: 'reg.pdf', sizeBytes: 2048 });

      await service.uploadDocument(42, 'BUSINESS_REGISTRATION', PDF);

      expect(m.kycDocument.update).toHaveBeenCalledWith({
        where: { id: 3 },
        data: { deletedAt: expect.any(Date) },
      });
      expect(fakeStorage.deleteObject).toHaveBeenCalledWith(
        'kyc-documents/7/business_registration-1-old.pdf',
      );
    });
  });

  describe('submitKyc', () => {
    it('rejects an incomplete submission and does not change status', async () => {
      m.companyKyc.findUnique.mockResolvedValue(kycRow({ status: 'NOT_SUBMITTED' }));
      await expect(service.submitKyc(42)).rejects.toBeInstanceOf(BadRequestException);
      expect(m.companyKyc.update).not.toHaveBeenCalled();
    });

    it('transitions a complete submission NOT_SUBMITTED → PENDING and audits it', async () => {
      m.companyKyc.findUnique
        .mockResolvedValueOnce(
          kycRow({
            status: 'NOT_SUBMITTED',
            legalName: 'Acme',
            gstNumber: '27AAACA1234A1Z5',
            authorizedPersonName: 'Asha',
            documents: [{ docType: 'BUSINESS_REGISTRATION' }, { docType: 'AUTHORIZED_PERSON_ID' }],
          }),
        )
        .mockResolvedValueOnce(kycRow({ status: 'PENDING' }));
      m.companyKyc.update.mockResolvedValue({});

      await service.submitKyc(42);

      const updateArg = m.companyKyc.update.mock.calls[0]?.[0] as {
        data: { status: string; submittedAt: Date };
      };
      expect(updateArg.data.status).toBe('PENDING');
      expect(updateArg.data.submittedAt).toBeInstanceOf(Date);
      const auditArg = m.profileAuditLog.create.mock.calls[0]?.[0] as { data: { action: string } };
      expect(auditArg.data.action).toBe('KYC_SUBMITTED');
    });

    it('refuses to resubmit an already-verified company', async () => {
      m.companyKyc.findUnique.mockResolvedValue(kycRow({ status: 'VERIFIED' }));
      await expect(service.submitKyc(42)).rejects.toThrow(/already verified/i);
      expect(m.companyKyc.update).not.toHaveBeenCalled();
    });
  });

  describe('deleteDocument', () => {
    it('soft-deletes an owned document and audits it', async () => {
      m.kycDocument.findUnique.mockResolvedValue({
        id: 9,
        r2Key: 'kyc-documents/7/x.pdf',
        deletedAt: null,
        companyKyc: { companyId: 7 },
      });
      m.companyKyc.findUnique.mockResolvedValue(kycRow());

      await service.deleteDocument(42, 9);

      expect(m.kycDocument.update).toHaveBeenCalledWith({
        where: { id: 9 },
        data: { deletedAt: expect.any(Date) },
      });
      const auditArg = m.profileAuditLog.create.mock.calls[0]?.[0] as { data: { action: string } };
      expect(auditArg.data.action).toBe('KYC_DOCUMENT_DELETE');
      expect(fakeStorage.deleteObject).toHaveBeenCalledWith('kyc-documents/7/x.pdf');
    });

    it('refuses to delete a document owned by another company (404, no leak)', async () => {
      m.kycDocument.findUnique.mockResolvedValue({
        id: 9,
        r2Key: 'k',
        deletedAt: null,
        companyKyc: { companyId: 99 },
      });
      await expect(service.deleteDocument(42, 9)).rejects.toBeInstanceOf(NotFoundException);
      expect(m.kycDocument.update).not.toHaveBeenCalled();
    });
  });

  describe('getDocumentDownloadUrl', () => {
    it('returns a short-lived signed URL for an owned document', async () => {
      m.kycDocument.findUnique.mockResolvedValue({
        r2Key: 'kyc-documents/7/x.pdf',
        deletedAt: null,
        companyKyc: { companyId: 7 },
      });
      const res = await service.getDocumentDownloadUrl(42, 9);
      expect(res).toEqual({ url: 'https://signed.example/doc', expiresInSeconds: 15 * 60 });
      expect(fakeStorage.getSignedDownloadUrl).toHaveBeenCalledWith('kyc-documents/7/x.pdf', 15 * 60);
    });

    it('refuses a document owned by another company', async () => {
      m.kycDocument.findUnique.mockResolvedValue({
        r2Key: 'k',
        deletedAt: null,
        companyKyc: { companyId: 99 },
      });
      await expect(service.getDocumentDownloadUrl(42, 9)).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
