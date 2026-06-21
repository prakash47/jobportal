import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { prisma, Prisma, type CompanyType } from '@jobportal/db';
import { syncCompany } from '@jobportal/search';
// Generic, side-effect-free utils shared with the candidate profile editor.
// Imported (not duplicated) — these are leaf helpers with no candidate-specific
// behaviour, so reusing them does not couple the recruiter flow to candidate
// logic or change candidate behaviour.
import { buildDiff, isDiffEmpty } from '../profile/audit';
import { stripUndefined } from '../profile/strip-undefined';
import { ClamAVService } from '../clamav/clamav.service';
import { StorageService } from '../storage/storage.service';
import type { UpdateRecruiterCompanyInput, UpdateRecruiterProfileInput } from './dto';
import { buildLogoKey, logoFailureMessage, validateLogo } from './logo-validators';

// Single network round-trip view: User + Recruiter + the recruiter's Company.
export interface RecruiterProfileView {
  user: { id: number; email: string; name: string; emailVerified: boolean };
  recruiter: {
    designation: string | null;
    department: string | null;
    contactPhone: string | null;
    altPocName: string | null;
    altPocEmail: string | null;
    altPocPhone: string | null;
    workEmailVerified: boolean;
    createdAt: Date;
  };
  company: {
    id: number;
    slug: string;
    name: string;
    description: string | null;
    logoUrl: string | null;
    websiteUrl: string | null;
    companyType: CompanyType | null;
    industryId: number | null;
    headquartersCityId: number | null;
    employeeCount: string | null;
    foundedYear: number | null;
  };
}

// Company fields whose value is mirrored into the Elasticsearch company doc
// (name/description/websiteUrl/industryId/headquartersCityId — the latter two
// drive the derived industrySlug/headquartersCitySlug). A change to any of
// these needs a re-index; employeeCount / foundedYear / companyType are NOT in
// ES, so editing only those skips the sync.
const ES_RELEVANT_COMPANY_KEYS = [
  'name',
  'description',
  'websiteUrl',
  'industryId',
  'headquartersCityId',
] as const;

// Empty string from the form means "clear this field" → store null. undefined
// (omitted key) is already dropped by stripUndefined upstream.
function emptyToNull<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) out[k] = v === '' ? null : v;
  return out as T;
}

@Injectable()
export class RecruiterProfileService {
  private readonly logger = new Logger(RecruiterProfileService.name);

  constructor(
    private readonly storage: StorageService,
    private readonly clamav: ClamAVService,
  ) {}

  async getProfile(userId: number): Promise<RecruiterProfileView> {
    const recruiter = await prisma.recruiter.findUnique({
      where: { userId },
      select: {
        designation: true,
        department: true,
        contactPhone: true,
        altPocName: true,
        altPocEmail: true,
        altPocPhone: true,
        workEmailVerified: true,
        createdAt: true,
        user: { select: { id: true, email: true, name: true, emailVerified: true } },
        company: {
          select: {
            id: true,
            slug: true,
            name: true,
            description: true,
            logoUrl: true,
            websiteUrl: true,
            companyType: true,
            industryId: true,
            headquartersCityId: true,
            employeeCount: true,
            foundedYear: true,
          },
        },
      },
    });
    if (!recruiter) throw new NotFoundException('Recruiter profile not found');
    const { user, company, ...recruiterFields } = recruiter;
    return { user, recruiter: recruiterFields, company };
  }

  // Resolves the recruiter's own company id from the JWT subject — never trust
  // a company id from the request body. Every recruiter has exactly one company
  // (SRS §4.9.1 registration), and onDelete: Restrict guarantees it exists.
  private async resolveCompanyId(userId: number): Promise<number> {
    const recruiter = await prisma.recruiter.findUnique({
      where: { userId },
      select: { companyId: true },
    });
    if (!recruiter) throw new NotFoundException('Recruiter profile not found');
    return recruiter.companyId;
  }

  async updateProfile(
    userId: number,
    input: UpdateRecruiterProfileInput,
  ): Promise<RecruiterProfileView> {
    const before = await this.getProfile(userId);

    // name lives on User; the rest on Recruiter.
    const { name, ...recruiterFields } = input;
    const userPatch = stripUndefined({ name });
    const recruiterPatch = emptyToNull(stripUndefined({ ...recruiterFields }));

    await prisma.$transaction(async (tx) => {
      if (Object.keys(userPatch).length > 0) {
        await tx.user.update({
          where: { id: userId },
          data: userPatch as unknown as Prisma.UserUpdateInput,
        });
      }
      if (Object.keys(recruiterPatch).length > 0) {
        await tx.recruiter.update({
          where: { userId },
          data: recruiterPatch as unknown as Prisma.RecruiterUpdateInput,
        });
      }
    });

    const after = await this.getProfile(userId);
    const diff = buildDiff(flattenProfile(before), flattenProfile(after));
    if (!isDiffEmpty(diff)) {
      await prisma.profileAuditLog.create({
        data: {
          userId,
          action: 'RECRUITER_PROFILE_UPDATE',
          diff: diff as unknown as Prisma.InputJsonValue,
        },
      });
    }
    return after;
  }

  async updateCompany(
    userId: number,
    input: UpdateRecruiterCompanyInput,
  ): Promise<RecruiterProfileView> {
    const companyId = await this.resolveCompanyId(userId);
    const before = await this.getProfile(userId);

    // Validate FK targets up front so a bad id is a clean 400, not a 500 from
    // Prisma's FK constraint.
    if (input.industryId != null) {
      const found = await prisma.industry.findUnique({
        where: { id: input.industryId },
        select: { id: true },
      });
      if (!found) throw new BadRequestException('Industry not found');
    }
    if (input.headquartersCityId != null) {
      const found = await prisma.city.findUnique({
        where: { id: input.headquartersCityId },
        select: { id: true },
      });
      if (!found) throw new BadRequestException('City not found');
    }

    const data = emptyToNull(
      stripUndefined({
        name: input.name,
        description: input.description,
        websiteUrl: input.websiteUrl,
        companyType: input.companyType,
        industryId: input.industryId,
        headquartersCityId: input.headquartersCityId,
        employeeCount: input.employeeCount,
        foundedYear: input.foundedYear,
      }),
    );

    if (Object.keys(data).length > 0) {
      await prisma.company.update({
        where: { id: companyId },
        data: data as unknown as Prisma.CompanyUpdateInput,
      });
    }

    const after = await this.getProfile(userId);
    const diff = buildDiff(flattenCompany(before.company), flattenCompany(after.company));
    if (!isDiffEmpty(diff)) {
      await prisma.profileAuditLog.create({
        data: {
          userId,
          action: 'COMPANY_UPDATE',
          diff: diff as unknown as Prisma.InputJsonValue,
        },
      });
    }

    // Keep ES consistent — fire-and-log, never block the response (mirrors the
    // job-publish side-effect pattern in recruiter-jobs).
    if (ES_RELEVANT_COMPANY_KEYS.some((k) => k in data)) {
      this.fireCompanySync(companyId);
    }
    return after;
  }

  async uploadLogo(
    userId: number,
    file: { originalname: string; mimetype: string; size: number; buffer: Buffer },
  ): Promise<RecruiterProfileView> {
    const companyId = await this.resolveCompanyId(userId);

    const validation = validateLogo(file.originalname, file.mimetype, file.size);
    if (!validation.ok) throw new BadRequestException(logoFailureMessage(validation));

    const scan = await this.clamav.scan(file.originalname, file.buffer);
    if (scan === 'INFECTED') {
      this.logger.warn(`rejected INFECTED logo upload for user=${userId}`);
      throw new BadRequestException('File failed virus scan');
    }

    const existing = await prisma.company.findUniqueOrThrow({
      where: { id: companyId },
      select: { logoUrl: true },
    });

    const key = buildLogoKey(companyId, validation.ext, randomBytes(8).toString('hex'));
    await this.storage.putObject(key, file.buffer, validation.mimeType);
    const url = this.storage.getPublicUrl(key);

    try {
      await prisma.company.update({ where: { id: companyId }, data: { logoUrl: url } });
    } catch (err) {
      this.logger.warn(`company.update failed after logo put — cleaning up ${key}`);
      try {
        await this.storage.deleteObject(key);
      } catch (cleanupErr) {
        this.logger.error(
          `failed to clean up orphan logo ${key}: ${(cleanupErr as Error).message}`,
        );
      }
      throw err;
    }

    // Replace-in-place: best-effort delete of the previous object so R2 doesn't
    // accumulate orphans. Only deletes keys we minted (keyFromPublicUrl → null
    // for externally-hosted/seed logos).
    this.deletePreviousLogo(existing.logoUrl);

    await prisma.profileAuditLog.create({
      data: {
        userId,
        action: 'COMPANY_LOGO_UPDATE',
        diff: { before: existing.logoUrl, after: url } as unknown as Prisma.InputJsonValue,
      },
    });

    // logoUrl is part of the ES company doc.
    this.fireCompanySync(companyId);
    return this.getProfile(userId);
  }

  async removeLogo(userId: number): Promise<RecruiterProfileView> {
    const companyId = await this.resolveCompanyId(userId);
    const existing = await prisma.company.findUniqueOrThrow({
      where: { id: companyId },
      select: { logoUrl: true },
    });
    if (!existing.logoUrl) return this.getProfile(userId);

    await prisma.company.update({ where: { id: companyId }, data: { logoUrl: null } });
    this.deletePreviousLogo(existing.logoUrl);

    await prisma.profileAuditLog.create({
      data: {
        userId,
        action: 'COMPANY_LOGO_UPDATE',
        diff: { before: existing.logoUrl, after: null } as unknown as Prisma.InputJsonValue,
      },
    });

    this.fireCompanySync(companyId);
    return this.getProfile(userId);
  }

  private deletePreviousLogo(previousUrl: string | null): void {
    if (!previousUrl) return;
    const key = this.storage.keyFromPublicUrl(previousUrl);
    if (!key) return;
    this.storage.deleteObject(key).catch((err: unknown) => {
      this.logger.warn(`failed to delete previous logo ${key}: ${(err as Error).message}`);
    });
  }

  private fireCompanySync(companyId: number): void {
    syncCompany(companyId, 'index').catch((err: unknown) => {
      this.logger.warn(`syncCompany(${companyId}, index) failed: ${(err as Error).message}`);
    });
  }
}

// Audit-relevant recruiter-personal fields, flattened for buildDiff.
function flattenProfile(view: RecruiterProfileView): Record<string, unknown> {
  return {
    name: view.user.name,
    designation: view.recruiter.designation,
    department: view.recruiter.department,
    contactPhone: view.recruiter.contactPhone,
    altPocName: view.recruiter.altPocName,
    altPocEmail: view.recruiter.altPocEmail,
    altPocPhone: view.recruiter.altPocPhone,
  };
}

// Audit-relevant editable company fields, flattened for buildDiff.
function flattenCompany(company: RecruiterProfileView['company']): Record<string, unknown> {
  return {
    name: company.name,
    description: company.description,
    websiteUrl: company.websiteUrl,
    companyType: company.companyType,
    industryId: company.industryId,
    headquartersCityId: company.headquartersCityId,
    employeeCount: company.employeeCount,
    foundedYear: company.foundedYear,
  };
}
