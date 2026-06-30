import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { prisma, Prisma, type KycDocumentType, type KycStatus } from '@jobportal/db';
import { StorageService } from '../storage/storage.service';
import type { ListKycQueryInput, ReviewKycInput } from './dto';

const PAGE_SIZE = 20;
const DOWNLOAD_URL_TTL_SECONDS = 15 * 60;

// Masks an identifier to its last 4 chars for the list view (DPDP minimisation —
// the full value is only shown on the detail page to the reviewing admin).
function maskCode(v: string | null): string | null {
  if (!v) return v;
  const visible = 4;
  if (v.length <= visible) return '•'.repeat(v.length);
  return '•'.repeat(v.length - visible) + v.slice(-visible);
}

export interface KycListItem {
  companyId: number;
  companyName: string;
  companySlug: string;
  legalName: string | null;
  gstNumberMasked: string | null;
  status: KycStatus;
  submittedAt: Date | null;
  reviewedAt: Date | null;
  documentCount: number;
}

export interface KycListResult {
  items: KycListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface KycReviewDocument {
  id: number;
  docType: KycDocumentType;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  scanStatus: 'PENDING' | 'CLEAN' | 'INFECTED';
  uploadedAt: Date;
  downloadUrl: string;
}

export interface KycReviewDetail {
  company: {
    id: number;
    name: string;
    slug: string;
    logoUrl: string | null;
    websiteUrl: string | null;
  };
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
  reviewedById: number | null;
  rejectionReason: string | null;
  documents: KycReviewDocument[];
  downloadUrlTtlSeconds: number;
}

@Injectable()
export class AdminKycService {
  private readonly logger = new Logger(AdminKycService.name);

  constructor(private readonly storage: StorageService) {}

  // Review queue. Defaults to every submitted record (anything past
  // NOT_SUBMITTED); a status filter narrows it (e.g. PENDING for the queue).
  async listKyc(query: ListKycQueryInput): Promise<KycListResult> {
    const page = query.page ?? 1;
    const where: Prisma.CompanyKycWhereInput = query.status
      ? { status: query.status }
      : { status: { not: 'NOT_SUBMITTED' } };

    const [total, rows] = await Promise.all([
      prisma.companyKyc.count({ where }),
      prisma.companyKyc.findMany({
        where,
        orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        select: {
          companyId: true,
          status: true,
          legalName: true,
          gstNumber: true,
          submittedAt: true,
          reviewedAt: true,
          company: { select: { name: true, slug: true } },
          documents: { where: { deletedAt: null }, select: { id: true } },
        },
      }),
    ]);

    return {
      items: rows.map((r) => ({
        companyId: r.companyId,
        companyName: r.company.name,
        companySlug: r.company.slug,
        legalName: r.legalName,
        gstNumberMasked: maskCode(r.gstNumber),
        status: r.status,
        submittedAt: r.submittedAt,
        reviewedAt: r.reviewedAt,
        documentCount: r.documents.length,
      })),
      total,
      page,
      pageSize: PAGE_SIZE,
      totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    };
  }

  // Full detail for the reviewer, including short-lived signed URLs to view each
  // document. Full (unmasked) identifiers are shown here — the admin is the
  // authorized reviewer and needs them to cross-check against the documents.
  async getKycDetail(companyId: number): Promise<KycReviewDetail> {
    const kyc = await prisma.companyKyc.findUnique({
      where: { companyId },
      include: {
        company: { select: { id: true, name: true, slug: true, logoUrl: true, websiteUrl: true } },
        documents: {
          where: { deletedAt: null },
          orderBy: [{ docType: 'asc' }, { uploadedAt: 'desc' }],
        },
      },
    });
    if (!kyc) throw new NotFoundException('No verification record for this company');

    const documents: KycReviewDocument[] = await Promise.all(
      kyc.documents.map(async (d) => ({
        id: d.id,
        docType: d.docType,
        originalFilename: d.originalFilename,
        mimeType: d.mimeType,
        sizeBytes: d.sizeBytes,
        scanStatus: d.scanStatus,
        uploadedAt: d.uploadedAt,
        downloadUrl: await this.storage.getSignedDownloadUrl(d.r2Key, DOWNLOAD_URL_TTL_SECONDS),
      })),
    );

    return {
      company: kyc.company,
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
      reviewedById: kyc.reviewedById,
      rejectionReason: kyc.rejectionReason,
      documents,
      downloadUrlTtlSeconds: DOWNLOAD_URL_TTL_SECONDS,
    };
  }

  // Approve or reject a PENDING submission. Writes the verification decision +
  // a ProfileAuditLog row keyed by the reviewing admin's User id.
  async review(
    adminUserId: number,
    companyId: number,
    input: ReviewKycInput,
  ): Promise<KycReviewDetail> {
    const kyc = await prisma.companyKyc.findUnique({
      where: { companyId },
      select: { status: true },
    });
    if (!kyc) throw new NotFoundException('No verification record for this company');
    if (kyc.status !== 'PENDING') {
      throw new BadRequestException('Only submissions pending review can be approved or rejected');
    }

    const newStatus: KycStatus = input.decision === 'APPROVE' ? 'VERIFIED' : 'REJECTED';
    const reason = input.decision === 'REJECT' ? (input.reason ?? null) : null;

    await prisma.$transaction(async (tx) => {
      await tx.companyKyc.update({
        where: { companyId },
        data: {
          status: newStatus,
          reviewedAt: new Date(),
          reviewedById: adminUserId,
          rejectionReason: reason,
        },
      });
      await tx.profileAuditLog.create({
        data: {
          userId: adminUserId,
          action: input.decision === 'APPROVE' ? 'KYC_APPROVED' : 'KYC_REJECTED',
          diff: {
            companyId,
            status: { before: 'PENDING', after: newStatus },
            ...(reason ? { reason } : {}),
          } as unknown as Prisma.InputJsonValue,
        },
      });
    });

    this.logger.log(`admin=${adminUserId} ${input.decision} KYC for company=${companyId}`);
    return this.getKycDetail(companyId);
  }
}
