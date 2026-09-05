import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { prisma, type Prisma } from '@jobportal/db';
import { StorageService } from '../storage/storage.service';
import { ClamAVService } from '../clamav/clamav.service';
import {
  buildProfilePhotoKey,
  photoFailureMessage,
  validatePhoto,
} from './photo-validators';

export interface ProfilePhotoView {
  imageUrl: string | null;
}

/**
 * Seeker profile photo — upload and remove.
 *
 * Modelled directly on `RecruiterProfileService.uploadLogo`, which is the
 * repo's only other image upload: validate → virus scan → put → update the row
 * → clean up the orphan on failure → best-effort delete of the previous object
 * → audit. Deviating from that shape would mean two different answers to the
 * same questions, so it deliberately does not.
 *
 * NO SCHEMA CHANGE. `User.image` already exists — it is the column Google
 * sign-in writes an avatar URL into. Reusing it is safe rather than convenient:
 * `GoogleOAuthService` links an existing account with `image: byEmail.image ??
 * profile.picture`, so an uploaded photo WINS over Google's and is never
 * clobbered on a later sign-in. The only path that assigns Google's picture
 * outright is account CREATION, where there is nothing to overwrite.
 */
@Injectable()
export class ProfilePhotoService {
  private readonly logger = new Logger(ProfilePhotoService.name);

  constructor(
    private readonly storage: StorageService,
    private readonly clamav: ClamAVService,
  ) {}

  async upload(
    userId: number,
    file: { originalname: string; mimetype: string; size: number; buffer: Buffer },
  ): Promise<ProfilePhotoView> {
    const validation = validatePhoto(file.originalname, file.mimetype, file.size);
    if (!validation.ok) throw new BadRequestException(photoFailureMessage(validation));

    const scan = await this.clamav.scan(file.originalname, file.buffer);
    if (scan === 'INFECTED') {
      // Ids only — never the filename, which is caller-controlled and ends up
      // in operator-facing logs.
      this.logger.warn(`rejected INFECTED profile photo for user=${userId}`);
      throw new BadRequestException('File failed virus scan');
    }

    const existing = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { image: true },
    });

    const key = buildProfilePhotoKey(userId, validation.ext, randomBytes(8).toString('hex'));
    await this.storage.putObject(key, file.buffer, validation.mimeType);
    const url = this.storage.getPublicUrl(key);

    try {
      await prisma.user.update({ where: { id: userId }, data: { image: url } });
    } catch (err) {
      // The object is already in the bucket; without this it becomes an orphan
      // nothing references and nothing will ever clean up.
      this.logger.warn(`user.update failed after photo put — cleaning up ${key}`);
      try {
        await this.storage.deleteObject(key);
      } catch (cleanupErr) {
        this.logger.error(
          `failed to clean up orphan photo ${key}: ${(cleanupErr as Error).message}`,
        );
      }
      throw err;
    }

    this.deletePreviousPhoto(existing.image);
    await this.audit(userId, existing.image, url);

    // Resolved, never the raw stored value. `getPublicUrl` bakes an absolute
    // origin into the row, so a photo uploaded while R2_PUBLIC_URL is blank
    // keeps a localhost origin forever — provisioning R2 later does not rewrite
    // those rows. Serialising through resolveStoredUrl makes them self-heal,
    // which is the same fix bugfix/asset-url-origin applied to company logos.
    return { imageUrl: this.storage.resolveStoredUrl(url) };
  }

  async remove(userId: number): Promise<ProfilePhotoView> {
    const existing = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { image: true },
    });
    if (existing.image === null) return { imageUrl: null };

    await prisma.user.update({ where: { id: userId }, data: { image: null } });
    this.deletePreviousPhoto(existing.image);
    await this.audit(userId, existing.image, null);

    return { imageUrl: null };
  }

  /**
   * Best-effort delete of the object a URL points at, so the bucket does not
   * accumulate every photo a user has ever set.
   *
   * Only deletes keys WE minted: `keyFromPublicUrl` returns null for anything
   * else, which matters because `User.image` may hold a Google-hosted avatar
   * URL from OAuth sign-in. Deleting is fire-and-forget — the row already
   * points at the new photo, so a failed cleanup must not fail the request.
   */
  private deletePreviousPhoto(previousUrl: string | null): void {
    if (!previousUrl) return;
    const key = this.storage.keyFromPublicUrl(previousUrl);
    if (!key || !key.startsWith('profile-photos/')) return;
    void this.storage.deleteObject(key).catch((err: unknown) => {
      this.logger.warn(
        `failed to delete previous photo ${key}: ${err instanceof Error ? err.message : 'unknown'}`,
      );
    });
  }

  private async audit(userId: number, before: string | null, after: string | null): Promise<void> {
    await prisma.profileAuditLog.create({
      data: {
        userId,
        action: 'PROFILE_UPDATE',
        diff: { field: 'image', before, after } as unknown as Prisma.InputJsonValue,
      },
    });
  }
}
