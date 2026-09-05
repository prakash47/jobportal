import {
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
  StreamableFile,
} from '@nestjs/common';
import { StorageService } from '../storage/storage.service';

// Public, unauthenticated passthrough for permanently-public assets (company
// logos). In PRODUCTION this route is dormant — R2_PUBLIC_URL points logos at
// the CDN and images never touch the API. It exists so that in LOCAL DEV (no
// R2/CDN configured) an uploaded logo still resolves to a real, renderable URL
// (StorageService.getPublicUrl falls back to `${API_URL}/media/...`).
//
// Only the company-logo key shape is served; the filename is validated against
// buildLogoKey's format so nothing else in the bucket is reachable here.
const LOGO_FILE_RE = /^[0-9]+-[0-9]+-[0-9a-f]+\.(png|jpg|jpeg|webp)$/;

// Same shape as a logo key (buildProfilePhotoKey mirrors buildLogoKey), so the
// same guarantee holds: only files this API minted are reachable, and the
// random suffix keeps keys from being enumerable — which is what stops a public
// passthrough from being a directory of every seeker's face.
const PHOTO_FILE_RE = /^[0-9]+-[0-9]+-[0-9a-f]+\.(png|jpg|jpeg|webp)$/;

@Controller('media')
export class MediaController {
  constructor(private readonly storage: StorageService) {}

  @Get('company-logos/:file')
  @Header('Cache-Control', 'public, max-age=31536000, immutable')
  async companyLogo(@Param('file') file: string): Promise<StreamableFile> {
    if (!LOGO_FILE_RE.test(file)) throw new NotFoundException('Not found');
    const obj = await this.storage.getObject(`company-logos/${file}`);
    if (!obj) throw new NotFoundException('Not found');
    return new StreamableFile(obj.body, { type: obj.contentType });
  }

  // Seeker profile photos. Unlike a resume (a download) this renders INLINE in
  // an <img>, so the response pins what it is: X-Content-Type-Options stops a
  // browser sniffing a different type out of the bytes, and the allowlist
  // already refuses SVG at upload time. Cache-Control is NOT immutable here —
  // a photo is replaceable, and the key changes on every upload anyway, so a
  // shorter window keeps a removed photo from lingering in caches for a year.
  @Get('profile-photos/:file')
  @Header('Cache-Control', 'public, max-age=3600')
  @Header('X-Content-Type-Options', 'nosniff')
  async profilePhoto(@Param('file') file: string): Promise<StreamableFile> {
    if (!PHOTO_FILE_RE.test(file)) throw new NotFoundException('Not found');
    const obj = await this.storage.getObject(`profile-photos/${file}`);
    if (!obj) throw new NotFoundException('Not found');
    return new StreamableFile(obj.body, { type: obj.contentType });
  }
}
