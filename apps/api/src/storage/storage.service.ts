import { Injectable, Logger } from '@nestjs/common';
import { GetObjectCommand, PutObjectCommand, DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

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

  constructor() {
    const accountId = process.env.R2_ACCOUNT_ID;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
    this.bucket = process.env.R2_BUCKET ?? 'jobportal-dev';

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

  // Test seam — used by integration tests with the in-memory backend.
  getMemoryObject(key: string): { body: Buffer; contentType: string } | undefined {
    return this.memory.get(key);
  }
}
