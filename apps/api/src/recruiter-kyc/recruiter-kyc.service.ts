import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { isFlagEnabled } from '@jobportal/feature-flags';
import { prisma, Prisma, type KycDocumentType, type KycStatus } from '@jobportal/db';
import { stripUndefined } from '../profile/strip-undefined';
import { ClamAVService } from '../clamav/clamav.service';
import { StorageService } from '../storage/storage.service';
import type { SaveKycInput } from './dto';
import {
  buildKycKey,
  kycFailureMessage,
  validateKycDocument,
} from './kyc-validators';

// L3 killswitch — emergency stop for the whole KYC flow. ON (enabled:true) means
// the feature is DISABLED. Checked globally (no user context) at the top of every
// mutation, mirroring killswitch.transactional_emails in the email processor.
const KYC_KILLSWITCH_FLAG = 'killswitch.recruiter_kyc';

const DOWNLOAD_URL_TTL_SECONDS = 15 * 60;

export interface KycDocumentView {
  id: number;
  docType: KycDocumentType;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  scanStatus: 'PENDING' | 'CLEAN' | 'INFECTED';
  uploadedAt: Date;
}

export interface KycView {
  status: KycStatus;
  legalName: string | null;
  gstNumber: string | null;
  panNumber: string | null;
  registrationNumber: string | null;
  authorizedPersonName: string | null;
  authorizedPersonDesignation: string | null;
  authorizedPersonIdType: string | null;
  submittedAt: Date | null;
  reviewedAt: Date | null;
  rejectionReason: string | null;
  documents: KycDocumentView[];
}

// Empty string from the form means "clear this field" → null. undefined (omitted
// key) is dropped upstream by stripUndefined.
function emptyToNull<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) out[k] = v === '' ? null : v;
  return out as T;
}

@Injectable()
export class RecruiterKycService {
  private readonly logger = new Logger(RecruiterKycService.name);

  constructor(
    private readonly storage: StorageService,
    private readonly clamav: ClamAVService,
  ) {}

  // Reads the company's KYC state (including the live, non-deleted documents).
  // Not killswitch-gated: a recruiter can always SEE their status, even if new
  // submissions are paused. Returns a NOT_SUBMITTED default when no row exists.
  async getKyc(userId: number): Promise<KycView> {
    const companyId = await this.resolveCompanyId(userId);
    const kyc = await prisma.companyKyc.findUnique({
      where: { companyId },
      include: {
        documents: {
          where: { deletedAt: null },
          orderBy: [{ docType: 'asc' }, { uploadedAt: 'desc' }],
        },
      },
    });
    if (!kyc) {
      return {
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
      };
    }
    return {
      status: kyc.status,
      legalName: kyc.legalName,
      gstNumber: kyc.gstNumber,
      panNumber: kyc.panNumber,
      registrationNumber: kyc.registrationNumber,
      authorizedPersonName: kyc.authorizedPersonName,
      authorizedPersonDesignation: kyc.authorizedPersonDesignation,
      authorizedPersonIdType: kyc.authorizedPersonIdType,
      submittedAt: kyc.submittedAt,
      reviewedAt: kyc.reviewedAt,
      rejectionReason: kyc.rejectionReason,
      documents: kyc.documents.map((d) => this.toDocView(d)),
    };
  }

  // Saves the identifier form as a DRAFT — does not change the verification
  // status (the recruiter submits separately). Editing identifiers while
  // REJECTED is allowed; the row stays REJECTED until resubmit.
  async saveKyc(userId: number, input: SaveKycInput): Promise<KycView> {
    await this.assertKycEnabled();
    const companyId = await this.resolveCompanyId(userId);

    const data = emptyToNull(stripUndefined({ ...input }));
    await prisma.companyKyc.upsert({
      where: { companyId },
      create: { companyId, ...data } as unknown as Prisma.CompanyKycUncheckedCreateInput,
      update: data as unknown as Prisma.CompanyKycUpdateInput,
    });

    return this.getKyc(userId);
  }

  async uploadDocument(
    userId: number,
    docType: KycDocumentType,
    file: { originalname: string; mimetype: string; size: number; buffer: Buffer },
  ): Promise<KycView> {
    await this.assertKycEnabled();
    const companyId = await this.resolveCompanyId(userId);

    const validation = validateKycDocument(file.originalname, file.mimetype, file.size);
    if (!validation.ok) throw new BadRequestException(kycFailureMessage(validation));

    // Scan first — an INFECTED file never lands in R2 and never writes a row.
    const scan = await this.clamav.scan(file.originalname, file.buffer);
    if (scan === 'INFECTED') {
      this.logger.warn(`rejected INFECTED KYC upload for user=${userId}`);
      throw new BadRequestException('File failed virus scan');
    }

    const kycId = await this.getOrCreateKycId(companyId);

    // Supersede the previous active document of the same type (one current per
    // type). The old row is soft-deleted (audit trail) and its R2 object removed
    // best-effort after the new row is committed.
    const previous = await prisma.kycDocument.findFirst({
      where: { companyKycId: kycId, docType, deletedAt: null },
      select: { id: true, r2Key: true },
    });

    const key = buildKycKey(companyId, docType, validation.ext, randomBytes(8).toString('hex'));
    await this.storage.putObject(key, file.buffer, validation.mimeType);

    try {
      await prisma.$transaction(async (tx) => {
        if (previous) {
          await tx.kycDocument.update({
            where: { id: previous.id },
            data: { deletedAt: new Date() },
          });
        }
        const doc = await tx.kycDocument.create({
          data: {
            companyKycId: kycId,
            docType,
            r2Key: key,
            originalFilename: file.originalname,
            sizeBytes: validation.sizeBytes,
            mimeType: validation.mimeType,
            scanStatus: 'CLEAN',
            uploadedById: userId,
          },
        });
        await tx.profileAuditLog.create({
          data: {
            userId,
            action: 'KYC_DOCUMENT_UPLOAD',
            diff: {
              docType,
              documentId: doc.id,
              originalFilename: doc.originalFilename,
              sizeBytes: doc.sizeBytes,
            } as unknown as Prisma.InputJsonValue,
          },
        });
      });
    } catch (err) {
      this.logger.warn(`tx failed after R2 put — cleaning up ${key}`);
      try {
        await this.storage.deleteObject(key);
      } catch (cleanupErr) {
        this.logger.error(`failed to clean up orphan ${key}: ${(cleanupErr as Error).message}`);
      }
      throw err;
    }

    if (previous) this.bestEffortDelete(previous.r2Key);
    return this.getKyc(userId);
  }

  async deleteDocument(userId: number, documentId: number): Promise<KycView> {
    await this.assertKycEnabled();
    const companyId = await this.resolveCompanyId(userId);

    const doc = await prisma.kycDocument.findUnique({
      where: { id: documentId },
      select: { id: true, r2Key: true, deletedAt: true, companyKyc: { select: { companyId: true } } },
    });
    // Not-found OR not-owned both surface as 404 so a recruiter cannot probe
    // other companies' document ids.
    if (!doc || doc.deletedAt !== null || doc.companyKyc.companyId !== companyId) {
      throw new NotFoundException('Document not found');
    }

    await prisma.$transaction(async (tx) => {
      await tx.kycDocument.update({ where: { id: documentId }, data: { deletedAt: new Date() } });
      await tx.profileAuditLog.create({
        data: {
          userId,
          action: 'KYC_DOCUMENT_DELETE',
          diff: { documentId } as unknown as Prisma.InputJsonValue,
        },
      });
    });

    this.bestEffortDelete(doc.r2Key);
    return this.getKyc(userId);
  }

  // Returns a short-lived signed URL for an owned document. KYC documents are
  // sensitive PII — never public, never cached — so the URL expires in 15 min.
  async getDocumentDownloadUrl(
    userId: number,
    documentId: number,
  ): Promise<{ url: string; expiresInSeconds: number }> {
    const companyId = await this.resolveCompanyId(userId);
    const doc = await prisma.kycDocument.findUnique({
      where: { id: documentId },
      select: { r2Key: true, deletedAt: true, companyKyc: { select: { companyId: true } } },
    });
    if (!doc || doc.deletedAt !== null || doc.companyKyc.companyId !== companyId) {
      throw new NotFoundException('Document not found');
    }
    const url = await this.storage.getSignedDownloadUrl(doc.r2Key, DOWNLOAD_URL_TTL_SECONDS);
    return { url, expiresInSeconds: DOWNLOAD_URL_TTL_SECONDS };
  }

  // Submits the (complete) KYC for admin review: NOT_SUBMITTED/REJECTED → PENDING.
  async submitKyc(userId: number): Promise<KycView> {
    await this.assertKycEnabled();
    const companyId = await this.resolveCompanyId(userId);

    const kyc = await prisma.companyKyc.findUnique({
      where: { companyId },
      include: { documents: { where: { deletedAt: null }, select: { docType: true } } },
    });

    if (kyc?.status === 'VERIFIED') {
      throw new BadRequestException('Your company is already verified');
    }
    if (kyc?.status === 'PENDING') {
      throw new BadRequestException('Your verification is already under review');
    }

    const docTypes = new Set(kyc?.documents.map((d) => d.docType) ?? []);
    const missing: string[] = [];
    if (!kyc?.legalName) missing.push('legal company name');
    if (!kyc?.gstNumber) missing.push('GST number');
    if (!kyc?.authorizedPersonName) missing.push('authorized person name');
    if (!docTypes.has('BUSINESS_REGISTRATION')) missing.push('business registration document');
    if (!docTypes.has('AUTHORIZED_PERSON_ID')) missing.push('authorized person ID proof');
    if (missing.length > 0) {
      throw new BadRequestException(`Complete the following before submitting: ${missing.join(', ')}`);
    }

    await prisma.$transaction(async (tx) => {
      await tx.companyKyc.update({
        where: { companyId },
        data: {
          status: 'PENDING',
          submittedAt: new Date(),
          reviewedAt: null,
          reviewedById: null,
          rejectionReason: null,
        },
      });
      // Audit the state change only — raw identifiers (GSTIN/PAN) are NOT copied
      // into the audit JSON (DPDP data-minimisation).
      await tx.profileAuditLog.create({
        data: {
          userId,
          action: 'KYC_SUBMITTED',
          diff: { status: { before: kyc?.status ?? 'NOT_SUBMITTED', after: 'PENDING' } } as unknown as Prisma.InputJsonValue,
        },
      });
    });

    return this.getKyc(userId);
  }

  // Resolves the recruiter's own company id from the JWT subject — never trust a
  // company id from the request. Mirrors RecruiterProfileService.
  private async resolveCompanyId(userId: number): Promise<number> {
    const recruiter = await prisma.recruiter.findUnique({
      where: { userId },
      select: { companyId: true },
    });
    if (!recruiter) throw new NotFoundException('Recruiter profile not found');
    return recruiter.companyId;
  }

  private async getOrCreateKycId(companyId: number): Promise<number> {
    const existing = await prisma.companyKyc.findUnique({
      where: { companyId },
      select: { id: true },
    });
    if (existing) return existing.id;
    const created = await prisma.companyKyc.create({
      data: { companyId },
      select: { id: true },
    });
    return created.id;
  }

  private async assertKycEnabled(): Promise<void> {
    if (await isFlagEnabled(KYC_KILLSWITCH_FLAG)) {
      throw new ServiceUnavailableException('Company verification is temporarily unavailable');
    }
  }

  private bestEffortDelete(r2Key: string): void {
    this.storage.deleteObject(r2Key).catch((err: unknown) => {
      this.logger.warn(`failed to delete KYC object ${r2Key}: ${(err as Error).message}`);
    });
  }

  private toDocView(d: {
    id: number;
    docType: KycDocumentType;
    originalFilename: string;
    mimeType: string;
    sizeBytes: number;
    scanStatus: 'PENDING' | 'CLEAN' | 'INFECTED';
    uploadedAt: Date;
  }): KycDocumentView {
    return {
      id: d.id,
      docType: d.docType,
      originalFilename: d.originalFilename,
      mimeType: d.mimeType,
      sizeBytes: d.sizeBytes,
      scanStatus: d.scanStatus,
      uploadedAt: d.uploadedAt,
    };
  }
}
