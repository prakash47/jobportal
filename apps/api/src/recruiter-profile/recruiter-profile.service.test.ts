import { BadRequestException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@jobportal/db', () => ({
  prisma: {
    recruiter: { findUnique: vi.fn(), update: vi.fn() },
    user: { update: vi.fn() },
    company: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn() },
    industry: { findUnique: vi.fn() },
    city: { findUnique: vi.fn() },
    profileAuditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
  Prisma: {},
}));
vi.mock('@jobportal/search', () => ({
  syncCompany: vi.fn().mockResolvedValue(undefined),
}));

import { prisma } from '@jobportal/db';
import { syncCompany } from '@jobportal/search';
import { RecruiterProfileService } from './recruiter-profile.service';

const mockedSync = syncCompany as ReturnType<typeof vi.fn>;
const m = prisma as unknown as {
  recruiter: { findUnique: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  user: { update: ReturnType<typeof vi.fn> };
  company: {
    findUnique: ReturnType<typeof vi.fn>;
    findUniqueOrThrow: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  industry: { findUnique: ReturnType<typeof vi.fn> };
  city: { findUnique: ReturnType<typeof vi.fn> };
  profileAuditLog: { create: ReturnType<typeof vi.fn> };
  $transaction: ReturnType<typeof vi.fn>;
};

type RowOverrides = {
  recruiter?: Record<string, unknown>;
  user?: Record<string, unknown>;
  company?: Record<string, unknown>;
};

function recruiterRow(over: RowOverrides = {}) {
  return {
    id: 1,
    userId: 42,
    companyId: 7,
    designation: 'Engineer',
    department: 'Engineering',
    contactPhone: '+91 99999 11111',
    altPocName: null,
    altPocEmail: null,
    altPocPhone: null,
    workEmailVerified: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    user: { id: 42, email: 'rec@acme.com', name: 'Rec', emailVerified: true, ...over.user },
    company: {
      id: 7,
      slug: 'acme',
      name: 'Acme',
      description: null,
      logoUrl: null,
      websiteUrl: null,
      companyType: null,
      industryId: null,
      headquartersCityId: null,
      employeeCount: null,
      foundedYear: null,
      ...over.company,
    },
    ...over.recruiter,
  };
}

const fakeStorage = {
  putObject: vi.fn(),
  getPublicUrl: vi.fn((k: string) => `http://localhost:4000/media/${k}`),
  keyFromPublicUrl: vi.fn((u: string) => (u.includes('/media/') ? u.split('/media/')[1]! : null)),
  deleteObject: vi.fn(),
};
const fakeClamav = { scan: vi.fn() };

describe('RecruiterProfileService', () => {
  let service: RecruiterProfileService;

  beforeEach(() => {
    vi.resetAllMocks();
    mockedSync.mockResolvedValue(undefined);
    fakeStorage.putObject.mockResolvedValue({});
    fakeStorage.getPublicUrl.mockImplementation((k: string) => `http://localhost:4000/media/${k}`);
    fakeStorage.keyFromPublicUrl.mockImplementation((u: string) =>
      u.includes('/media/') ? u.split('/media/')[1]! : null,
    );
    fakeStorage.deleteObject.mockResolvedValue(undefined);
    fakeClamav.scan.mockResolvedValue('CLEAN');
    m.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => unknown) => fn(prisma));
    m.profileAuditLog.create.mockResolvedValue({});
    service = new RecruiterProfileService(fakeStorage as never, fakeClamav as never);
  });

  describe('getProfile', () => {
    it('throws NotFound when there is no recruiter row', async () => {
      m.recruiter.findUnique.mockResolvedValue(null);
      await expect(service.getProfile(42)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('shapes user / recruiter / company into one view', async () => {
      m.recruiter.findUnique.mockResolvedValue(recruiterRow());
      const view = await service.getProfile(42);
      expect(view.user.email).toBe('rec@acme.com');
      expect(view.recruiter.designation).toBe('Engineer');
      expect(view.company.name).toBe('Acme');
    });
  });

  describe('updateProfile', () => {
    it('splits name → User and the rest → Recruiter, and writes an audit row', async () => {
      m.recruiter.findUnique
        .mockResolvedValueOnce(recruiterRow()) // before
        .mockResolvedValueOnce(recruiterRow({ recruiter: { designation: 'Staff Engineer' } })); // after

      await service.updateProfile(42, { name: 'Rec Two', designation: 'Staff Engineer' });

      expect(m.user.update).toHaveBeenCalledWith({
        where: { id: 42 },
        data: { name: 'Rec Two' },
      });
      expect(m.recruiter.update).toHaveBeenCalledWith({
        where: { userId: 42 },
        data: { designation: 'Staff Engineer' },
      });
      expect(m.profileAuditLog.create).toHaveBeenCalledTimes(1);
      const auditArg = m.profileAuditLog.create.mock.calls[0]?.[0] as { data: { action: string } };
      expect(auditArg.data.action).toBe('RECRUITER_PROFILE_UPDATE');
    });

    it('converts an empty string to null (clears the field)', async () => {
      m.recruiter.findUnique.mockResolvedValue(recruiterRow());
      await service.updateProfile(42, { department: '' });
      expect(m.recruiter.update).toHaveBeenCalledWith({
        where: { userId: 42 },
        data: { department: null },
      });
    });

    it('skips the audit row when nothing actually changed', async () => {
      m.recruiter.findUnique.mockResolvedValue(recruiterRow());
      // designation already 'Engineer' → no diff
      await service.updateProfile(42, { designation: 'Engineer' });
      expect(m.profileAuditLog.create).not.toHaveBeenCalled();
    });
  });

  describe('updateCompany', () => {
    it('re-indexes ES when an ES-relevant field (name) changes', async () => {
      m.recruiter.findUnique
        .mockResolvedValueOnce(recruiterRow()) // resolveCompanyId
        .mockResolvedValueOnce(recruiterRow()) // before
        .mockResolvedValueOnce(recruiterRow({ company: { name: 'Acme Corp' } })); // after
      m.company.update.mockResolvedValue({});

      await service.updateCompany(42, { name: 'Acme Corp' });

      expect(m.company.update).toHaveBeenCalledWith({
        where: { id: 7 },
        data: { name: 'Acme Corp' },
      });
      await Promise.resolve();
      expect(mockedSync).toHaveBeenCalledWith(7, 'index');
    });

    it('does NOT re-index ES when only non-ES fields (companyType) change', async () => {
      m.recruiter.findUnique
        .mockResolvedValueOnce(recruiterRow())
        .mockResolvedValueOnce(recruiterRow())
        .mockResolvedValueOnce(recruiterRow({ company: { companyType: 'STARTUP' } }));
      m.company.update.mockResolvedValue({});

      await service.updateCompany(42, { companyType: 'STARTUP' });

      expect(m.company.update).toHaveBeenCalledWith({
        where: { id: 7 },
        data: { companyType: 'STARTUP' },
      });
      await Promise.resolve();
      expect(mockedSync).not.toHaveBeenCalled();
    });

    it('rejects an unknown industryId with 400 before writing', async () => {
      m.recruiter.findUnique
        .mockResolvedValueOnce(recruiterRow())
        .mockResolvedValueOnce(recruiterRow());
      m.industry.findUnique.mockResolvedValue(null);

      await expect(service.updateCompany(42, { industryId: 999 })).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(m.company.update).not.toHaveBeenCalled();
    });
  });

  describe('uploadLogo', () => {
    const png = { originalname: 'logo.png', mimetype: 'image/png', size: 1024, buffer: Buffer.from('x') };

    it('rejects a non-image MIME without touching storage', async () => {
      m.recruiter.findUnique.mockResolvedValue(recruiterRow());
      await expect(
        service.uploadLogo(42, { ...png, mimetype: 'application/pdf' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(fakeStorage.putObject).not.toHaveBeenCalled();
    });

    it('rejects an INFECTED file', async () => {
      m.recruiter.findUnique.mockResolvedValue(recruiterRow());
      fakeClamav.scan.mockResolvedValue('INFECTED');
      await expect(service.uploadLogo(42, png)).rejects.toBeInstanceOf(BadRequestException);
      expect(fakeStorage.putObject).not.toHaveBeenCalled();
    });

    it('stores the object, writes the public URL, audits, and re-indexes ES', async () => {
      m.recruiter.findUnique.mockResolvedValue(recruiterRow());
      m.company.findUniqueOrThrow.mockResolvedValue({ logoUrl: null });
      m.company.update.mockResolvedValue({});

      await service.uploadLogo(42, png);

      expect(fakeStorage.putObject).toHaveBeenCalledTimes(1);
      const updateArg = m.company.update.mock.calls[0]?.[0] as { data: { logoUrl: string } };
      expect(updateArg.data.logoUrl).toMatch(/^http:\/\/localhost:4000\/media\/company-logos\/7-/);
      const auditArg = m.profileAuditLog.create.mock.calls[0]?.[0] as { data: { action: string } };
      expect(auditArg.data.action).toBe('COMPANY_LOGO_UPDATE');
      await Promise.resolve();
      expect(mockedSync).toHaveBeenCalledWith(7, 'index');
    });

    it('deletes the previous logo object when replacing one we minted', async () => {
      m.recruiter.findUnique.mockResolvedValue(recruiterRow());
      m.company.findUniqueOrThrow.mockResolvedValue({
        logoUrl: 'http://localhost:4000/media/company-logos/7-1-old.png',
      });
      m.company.update.mockResolvedValue({});

      await service.uploadLogo(42, png);
      await Promise.resolve();
      expect(fakeStorage.deleteObject).toHaveBeenCalledWith('company-logos/7-1-old.png');
    });
  });

  describe('removeLogo', () => {
    it('is a no-op when there is no logo', async () => {
      m.recruiter.findUnique.mockResolvedValue(recruiterRow());
      m.company.findUniqueOrThrow.mockResolvedValue({ logoUrl: null });
      await service.removeLogo(42);
      expect(m.company.update).not.toHaveBeenCalled();
      expect(m.profileAuditLog.create).not.toHaveBeenCalled();
    });

    it('nulls the column, deletes the object, audits, and re-indexes', async () => {
      m.recruiter.findUnique.mockResolvedValue(recruiterRow());
      m.company.findUniqueOrThrow.mockResolvedValue({
        logoUrl: 'http://localhost:4000/media/company-logos/7-1-old.png',
      });
      m.company.update.mockResolvedValue({});

      await service.removeLogo(42);

      expect(m.company.update).toHaveBeenCalledWith({ where: { id: 7 }, data: { logoUrl: null } });
      await Promise.resolve();
      expect(fakeStorage.deleteObject).toHaveBeenCalledWith('company-logos/7-1-old.png');
      expect(mockedSync).toHaveBeenCalledWith(7, 'index');
    });
  });
});
