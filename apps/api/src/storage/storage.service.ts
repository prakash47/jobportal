import { Injectable, Logger } from '@nestjs/common';
import { GetObjectCommand, PutObjectCommand, DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { resolveStoredAssetUrl } from '@jobportal/domain/asset-url';

// SRS §4.3.4 — uploads land in Cloudflare R2 (S3-compatible). When R2 env vars
// are blank (local dev without R2 keys) we fall back to an in-memory map so
// service-level tests + dev runs work without external dependencies; the
// in-memory backend is NEVER used in prod (presence of R2_ACCOUNT_ID flips
// the switch).

export interface StorageObjectMeta {
  key: string;
  size: number;
  contentType: string;
}

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client | null;
  private readonly bucket: string;
  private readonly memory = new Map<string, { body: Buffer; contentType: string }>();
  // Public base for PERMANENT, non-expiring asset URLs (e.g. company logos that
  // render on the public web pages, cached by Cloudflare). In prod this is the
  // CDN / R2 public domain; left blank locally, where getPublicUrl falls back
  // to the API's own /media passthrough so dev still renders the image.
  private readonly r2PublicBase: string | null;
  private readonly apiBase: string;

  constructor() {
    const accountId = process.env.R2_ACCOUNT_ID;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
    this.bucket = process.env.R2_BUCKET ?? 'jobportal-dev';
    this.r2PublicBase = process.env.R2_PUBLIC_URL?.replace(/\/+$/, '') || null;
    this.apiBase = (process.env.API_URL ?? 'http://localhost:4000').replace(/\/+$/, '');

    if (accountId && accessKeyId && secretAccessKey) {
      this.client = new S3Client({
        region: 'auto',
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: { accessKeyId, secretAccessKey },
      });
    } else {
      this.client = null;
      this.logger.log('R2 credentials missing — using in-memory fallback (DEV ONLY)');
    }
  }

  async putObject(key: string, body: Buffer, contentType: string): Promise<StorageObjectMeta> {
    if (this.client) {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
        }),
      );
    } else {
      this.memory.set(key, { body, contentType });
    }
    return { key, size: body.length, contentType };
  }

  async getSignedDownloadUrl(key: string, expiresInSeconds = 15 * 60): Promise<string> {
    if (this.client) {
      return getSignedUrl(
        this.client,
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
        { expiresIn: expiresInSeconds },
      );
    }
    // Dev fallback — emits an opaque internal URL. The web layer treats this
    // as "preview-only" and shows a banner explaining R2 isn't configured.
    return `local://memory/${encodeURIComponent(key)}`;
  }

  async deleteObject(key: string): Promise<void> {
    if (this.client) {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    } else {
      this.memory.delete(key);
    }
  }

  // Stable, NON-EXPIRING public URL for an object — used for assets served to
  // anonymous visitors (company logos). Distinct from getSignedDownloadUrl,
  // which is for private, time-limited files (resumes). In prod this resolves
  // to R2_PUBLIC_URL (the CDN); locally it points at the API's /media
  // passthrough (served by MediaController) so logos render in dev too.
  getPublicUrl(key: string): string {
    if (this.r2PublicBase) return `${this.r2PublicBase}/${key}`;
    return `${this.apiBase}/media/${key}`;
  }

  /**
   * Re-derive a STORED asset URL against the bases configured right now.
   *
   * `getPublicUrl`'s absolute result is written into the database
   * (`Company.logoUrl`), so a logo uploaded while `R2_PUBLIC_URL` was blank
   * keeps a `http://localhost:4000` origin permanently — provisioning R2 later
   * does not rewrite those rows. Serialising through this makes them self-heal.
   *
   * External URLs (a seeded logo, a Google avatar) are returned untouched; the
   * shared implementation in `@jobportal/domain` is the same one `apps/web`
   * uses, so the two surfaces cannot disagree about what a stored URL means.
   */
  resolveStoredUrl(stored: string | null | undefined): string | null {
    return resolveStoredAssetUrl(stored, {
      publicBase: this.r2PublicBase,
      apiBase: this.apiBase,
    });
  }

  // Reverse of getPublicUrl — extracts the storage key from a public URL we
  // previously minted, so we can delete the old object when a logo is replaced.
  // Returns null for URLs we don't recognise (e.g. an externally-hosted logo
  // set via a seed), in which case the caller skips deletion.
  keyFromPublicUrl(url: string): string | null {
    if (this.r2PublicBase && url.startsWith(`${this.r2PublicBase}/`)) {
      return url.slice(this.r2PublicBase.length + 1) || null;
    }
    const marker = `${this.apiBase}/media/`;
    if (url.startsWith(marker)) return url.slice(marker.length) || null;
    // Tolerate a different host but same /media/ path shape (e.g. URL minted
    // under a previous API_URL during local dev).
    const idx = url.indexOf('/media/');
    if (idx !== -1) return url.slice(idx + '/media/'.length) || null;
    return null;
  }

  // Reads an object's bytes (R2 or the in-memory dev backend). Returns null when
  // the key is absent. Used by the public /media passthrough in local dev.
  async getObject(key: string): Promise<{ body: Buffer; contentType: string } | null> {
    if (this.client) {
      try {
        const res = await this.client.send(
          new GetObjectCommand({ Bucket: this.bucket, Key: key }),
        );
        if (!res.Body) return null;
        const bytes = await res.Body.transformToByteArray();
        return {
          body: Buffer.from(bytes),
          contentType: res.ContentType ?? 'application/octet-stream',
        };
      } catch (err) {
        this.logger.warn(`getObject(${key}) failed: ${(err as Error).message}`);
        return null;
      }
    }
    const obj = this.memory.get(key);
    return obj ? { body: obj.body, contentType: obj.contentType } : null;
  }

  // Test seam — used by integration tests with the in-memory backend.
  getMemoryObject(key: string): { body: Buffer; contentType: string } | undefined {
    return this.memory.get(key);
  }
}
