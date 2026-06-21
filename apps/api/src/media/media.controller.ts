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
}
