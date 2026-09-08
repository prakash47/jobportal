import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { prisma, Prisma, type Resume } from '@jobportal/db';
import { ClamAVService } from '../clamav/clamav.service';
import { recomputeCompleteness } from '../profile/profile.service';
import { StorageService } from '../storage/storage.service';
import { buildResumeKey, validateResume } from './validators';

/**
 * How many resumes a candidate keeps.
 *
 * Uploading used to soft-delete the previous one, so "versions" did not exist:
 * there was the current file and nothing else. Older versions beyond this count
 * are retired on upload, newest kept.
 */
const MAX_RESUME_VERSIONS = 3;

export interface ResumeView {
  id: number;
  originalFilename: string;
  sizeBytes: number;
  mimeType: string;
  scanStatus: Resume['scanStatus'];
  uploadedAt: Date;
  isActive: boolean;
}

@Injectable()
export class ResumeService {
  private readonly logger = new Logger(ResumeService.name);

  constructor(
    private readonly storage: StorageService,
    private readonly clamav: ClamAVService,
  ) {}

  async getActive(userId: number): Promise<ResumeView | null> {
    const candidate = await prisma.candidate.findUnique({
      where: { userId },
      select: { activeResume: true },
    });
    if (!candidate?.activeResume || candidate.activeResume.deletedAt !== null) return null;
    return this.toView(candidate.activeResume, candidate.activeResume.id);
  }

  /**
   * A 15-minute presigned URL for one of the caller's OWN resumes.
   *
   * No longer gated on `feature.resume_download_pdf`. Owner decision: the
   * candidate uploaded this file, and handing it back to them behind a plan is
   * hostile — they are the only party who cannot already read it, since every
   * recruiter they applied to receives a copy. The flag stays in the catalogue
   * for a GENERATED profile PDF, a different artifact that does not exist yet.
   *
   * Ownership is still enforced. The lookup is scoped to this candidate, so an
   * id belonging to someone else resolves to nothing rather than returning a
   * 403 that would confirm the row exists.
   */
  async getDownloadUrl(
    userId: number,
    resumeId?: number,
  ): Promise<{ url: string; expiresInSeconds: number }> {
    const candidate = await prisma.candidate.findUnique({
      where: { userId },
      select: { id: true, activeResumeId: true },
    });
    if (!candidate) throw new NotFoundException('Candidate profile not found');

    const targetId = resumeId ?? candidate.activeResumeId;
    if (targetId === null || targetId === undefined) {
      throw new NotFoundException('No active resume on file');
    }
    const resume = await prisma.resume.findFirst({
      where: { id: targetId, candidateId: candidate.id, deletedAt: null },
    });
    if (!resume) throw new NotFoundException('Resume not found');
    if (resume.scanStatus !== 'CLEAN') {
      throw new ForbiddenException('Resume is still being scanned');
    }
    const url = await this.storage.getSignedDownloadUrl(resume.r2Key, 15 * 60);
    return { url, expiresInSeconds: 15 * 60 };
  }

  /** Every resume the candidate still holds, newest first. */
  async listVersions(userId: number): Promise<ResumeView[]> {
    const candidate = await prisma.candidate.findUnique({
      where: { userId },
      select: { id: true, activeResumeId: true },
    });
    if (!candidate) return [];
    const rows = await prisma.resume.findMany({
      where: { candidateId: candidate.id, deletedAt: null },
      orderBy: { uploadedAt: 'desc' },
    });
    return rows.map((r) => this.toView(r, candidate.activeResumeId));
  }

  /** Promote a stored version to be the one recruiters receive. */
  async setActive(userId: number, resumeId: number): Promise<ResumeView> {
    const candidate = await prisma.candidate.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!candidate) throw new NotFoundException('Candidate profile not found');
    const resume = await prisma.resume.findFirst({
      where: { id: resumeId, candidateId: candidate.id, deletedAt: null },
    });
    if (!resume) throw new NotFoundException('Resume not found');
    if (resume.scanStatus !== 'CLEAN') {
      throw new ForbiddenException('Resume is still being scanned');
    }
    await prisma.$transaction(async (tx) => {
      await tx.candidate.update({ where: { userId }, data: { activeResumeId: resume.id } });
      await tx.profileAuditLog.create({
        data: {
          userId,
          action: 'RESUME_UPLOAD',
          diff: { setActiveResumeId: resume.id } as unknown as Prisma.InputJsonValue,
        },
      });
    });
    await recomputeCompleteness(userId);
    return this.toView(resume, resume.id);
  }

  async upload(
    userId: number,
    file: { originalname: string; mimetype: string; size: number; buffer: Buffer },
  ): Promise<ResumeView> {
    const validation = validateResume(file.originalname, file.mimetype, file.size);
    if (!validation.ok) {
      throw new BadRequestException(this.failureMessage(validation));
    }

    const candidate = await prisma.candidate.findUnique({
      where: { userId },
      select: { id: true, activeResumeId: true },
    });
    if (!candidate) throw new NotFoundException('Candidate profile not found');

    // Scan first — if INFECTED we never put it in R2, never write the row.
    const scan = await this.clamav.scan(file.originalname, file.buffer);
    if (scan === 'INFECTED') {
      this.logger.warn(`rejected INFECTED resume upload for user=${userId}`);
      throw new BadRequestException('File failed virus scan');
    }

    const r2Key = buildResumeKey(candidate.id, validation.ext, randomBytes(8).toString('hex'));
    await this.storage.putObject(r2Key, file.buffer, validation.mimeType);

    let inserted;
    try {
      inserted = await prisma.$transaction(async (tx) => {
        const resume = await tx.resume.create({
          data: {
            candidateId: candidate.id,
            r2Key,
            originalFilename: file.originalname,
            sizeBytes: validation.sizeBytes,
            mimeType: validation.mimeType,
            scanStatus: 'CLEAN',
          },
        });
        // Previous versions are KEPT rather than soft-deleted — that deletion
        // is precisely why a candidate could only ever hold one resume. Only
        // what falls outside MAX_RESUME_VERSIONS is retired, newest first.
        const surviving = await tx.resume.findMany({
          where: { candidateId: candidate.id, deletedAt: null, id: { not: resume.id } },
          orderBy: { uploadedAt: 'desc' },
          select: { id: true },
        });
        const toRetire = surviving.slice(MAX_RESUME_VERSIONS - 1).map((r) => r.id);
        if (toRetire.length > 0) {
          await tx.resume.updateMany({
            where: { id: { in: toRetire } },
            data: { deletedAt: new Date() },
          });
        }
        await tx.candidate.update({
          where: { userId },
          data: { activeResumeId: resume.id },
        });
        await tx.profileAuditLog.create({
          data: {
            userId,
            action: 'RESUME_UPLOAD',
            diff: {
              resumeId: resume.id,
              originalFilename: resume.originalFilename,
              sizeBytes: resume.sizeBytes,
            } as unknown as Prisma.InputJsonValue,
          },
        });
        return resume;
      });
    } catch (txErr) {
      // Tx failed after R2 write — best-effort delete to avoid orphan.
      this.logger.warn(`tx failed after R2 put — cleaning up ${r2Key}`);
      try {
        await this.storage.deleteObject(r2Key);
      } catch (cleanupErr) {
        this.logger.error(
          `failed to clean up orphan ${r2Key}: ${(cleanupErr as Error).message}`,
        );
      }
      throw txErr;
    }

    await recomputeCompleteness(userId);
    return this.toView(inserted, inserted.id);
  }

  async delete(userId: number): Promise<void> {
    const candidate = await prisma.candidate.findUnique({
      where: { userId },
      select: { id: true, activeResumeId: true, activeResume: true },
    });
    if (!candidate?.activeResumeId || !candidate.activeResume) {
      throw new NotFoundException('No active resume on file');
    }
    const r2Key = candidate.activeResume.r2Key;

    await prisma.$transaction(async (tx) => {
      await tx.candidate.update({
        where: { userId },
        data: { activeResumeId: null },
      });
      await tx.resume.update({
        where: { id: candidate.activeResumeId! },
        data: { deletedAt: new Date() },
      });
      await tx.profileAuditLog.create({
        data: {
          userId,
          action: 'RESUME_DELETE',
          diff: { resumeId: candidate.activeResumeId } as unknown as Prisma.InputJsonValue,
        },
      });
    });

    // Best-effort delete from R2 — soft-deleted DB row is the source of truth.
    //
    // ADR 0002 decision 7: NOT when an application still points at this resume.
    // Applications now record which document was submitted, and recruiters read
    // it back through that snapshot. Destroying the object here would leave the
    // row intact and the bytes gone, so the recruiter endpoint would hand out a
    // presigned URL for a key that no longer exists — a 200 leading to a dead
    // link, which is worse than either serving it or refusing cleanly.
    //
    // The candidate has still withdrawn it: `activeResumeId` is null, it no
    // longer appears on their profile, and it can never be attached to a new
    // application. What survives is the copy already delivered to recruiters
    // they chose to apply to, which is the same thing as having sent it.
    // Erasing that on request is account deletion's job, not this endpoint's.
    const referencing = await prisma.application.count({
      where: { resumeId: candidate.activeResumeId },
    });
    if (referencing > 0) {
      this.logger.log(
        `retaining resume object ${r2Key}: referenced by ${referencing} application(s)`,
      );
    } else {
      try {
        await this.storage.deleteObject(r2Key);
      } catch (err) {
        this.logger.warn(`failed to delete resume from R2: ${r2Key} (${(err as Error).message})`);
      }
    }

    await recomputeCompleteness(userId);
  }

  private toView(r: Resume, activeResumeId: number | null): ResumeView {
    return {
      id: r.id,
      originalFilename: r.originalFilename,
      sizeBytes: r.sizeBytes,
      mimeType: r.mimeType,
      scanStatus: r.scanStatus,
      uploadedAt: r.uploadedAt,
      isActive: r.id === activeResumeId,
    };
  }

  private failureMessage(v: {
    reason: string;
    got?: string | number;
    limit?: number;
  }): string {
    switch (v.reason) {
      case 'EMPTY': return 'File is empty';
      case 'TOO_LARGE': return `File is too large (max ${v.limit} bytes)`;
      case 'EXT_NOT_ALLOWED': return 'File extension not allowed (PDF or DOCX only)';
      case 'MIME_NOT_ALLOWED': return 'File type not allowed (PDF or DOCX only)';
      default: return 'File rejected';
    }
  }
}
