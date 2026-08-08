import {
  BadRequestException,
  Controller,
  Get,
  HttpStatus,
  Param,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { parseDirectoryParams } from '@jobportal/domain/company-params';
import { ListCompaniesQueryDto } from './dto';
import { CompanySlugRedirect, PublicCompaniesService } from './public-companies.service';

// Public — no guard, mirroring pages the website already serves to anyone.
// There is no Company visibility column; only job-derived counts are gated to
// ACTIVE, inside the service.
@Controller({ path: 'companies', version: '1' })
export class PublicCompaniesController {
  constructor(private readonly companies: PublicCompaniesService) {}

  @Get()
  async list(@Query() query: unknown) {
    const parsed = ListCompaniesQueryDto.safeParse(query);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    // Re-serialize for the shared parser, which is the URL-layer contract and
    // owns the coercion rules. Duplicating them here is the drift
    // @jobportal/domain exists to prevent.
    const raw: Record<string, string | string[] | undefined> = {};
    if (parsed.data.category !== undefined) raw['category'] = parsed.data.category;
    if (parsed.data.sort !== undefined) raw['sort'] = parsed.data.sort;
    if (parsed.data.hiring !== undefined) raw['hiring'] = parsed.data.hiring;
    if (parsed.data.page !== undefined) raw['page'] = String(parsed.data.page);
    return this.companies.list(parseDirectoryParams(raw));
  }

  @Get(':handle')
  async detail(@Param('handle') handle: string, @Res({ passthrough: true }) res: Response) {
    try {
      return await this.companies.detail(handle);
    } catch (err) {
      if (err instanceof CompanySlugRedirect) {
        res.status(HttpStatus.PERMANENT_REDIRECT);
        res.setHeader('Location', `/v1/companies/${err.handle}`);
        // Also in the body, so a client that does not follow redirects can
        // self-correct its stored handle without parsing headers.
        return { handle: err.handle };
      }
      throw err;
    }
  }
}
