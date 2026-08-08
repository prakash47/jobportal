import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { isFlagEnabled } from '@jobportal/feature-flags';
import { prisma, Prisma, type Resume } from '@jobportal/db';
import { ClamAVService } from '../clamav/clamav.service';
import { recomputeCompleteness } from '../profile/profile.service';
import { StorageService } from '../storage/storage.service';
import { buildResumeKey, validateResume } from './validators';

const RESUME_DOWNLOAD_FLAG = 'feature.resume_download_pdf';

export interface ResumeView {
  id: number;
  originalFilename: string;
  sizeBytes: number;
  mimeType: string;
  scanStatus: Resume['scanStatus'];
  uploadedAt: Date;
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
    return this.toView(candidate.activeResume);
  }

  // Returns a 15-min presigned URL or throws ForbiddenException when the
  // download flag is off for this caller — the API is the last line of
  // defence per CLAUDE.md §4.
  async getDownloadUrl(userId: number): Promise<{ url: string; expiresInSeconds: number }> {
    const allowed = await isFlagEnabled(RESUME_DOWNLOAD_FLAG, { userId });
    if (!allowed) {
      throw new ForbiddenException('Resume download is not available on your plan');
    }
    const candidate = await prisma.candidate.findUnique({
      where: { userId },
      select: { activeResume: true },
    });
    if (!candidate?.activeResume || candidate.activeResume.deletedAt !== null) {
      throw new NotFoundException('No active resume on file');
    }
    if (candidate.activeResume.scanStatus !== 'CLEAN') {
      throw new ForbiddenException('Resume is still being scanned');
    }
    const url = await this.storage.getSignedDownloadUrl(candidate.activeResume.r2Key, 15 * 60);
    return { url, expiresInSeconds: 15 * 60 };
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
        // Soft-delete the previous active resume.
        if (candidate.activeResumeId !== null) {
          await tx.resume.update({
            where: { id: candidate.activeResumeId },
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
    return this.toView(inserted);
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

  private toView(r: Resume): ResumeView {
    return {
      id: r.id,
      originalFilename: r.originalFilename,
      sizeBytes: r.sizeBytes,
      mimeType: r.mimeType,
      scanStatus: r.scanStatus,
      uploadedAt: r.uploadedAt,
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
