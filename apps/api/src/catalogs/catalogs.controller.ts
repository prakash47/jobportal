import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { CatalogsService } from './catalogs.service';
import { CatalogQueryDto } from './dto';

// Public reference data — PUBLIC by omission of JwtAuthGuard, the same idiom
// as media.controller and alerts/unsubscribe. These tables have no per-user or
// visibility state to protect and the website already renders all of them
// publicly.
//
// Three routes on one controller rather than three controllers: the shape,
// validation and pagination are identical, and splitting them would triplicate
// the DTO wiring for no gain.
@Controller({ version: '1' })
export class CatalogsController {
  constructor(private readonly catalogs: CatalogsService) {}

  private parse(query: unknown) {
    const parsed = CatalogQueryDto.safeParse(query);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return parsed.data;
  }

  @Get('skills')
  async skills(@Query() query: unknown) {
    return this.catalogs.skills(this.parse(query));
  }

  @Get('cities')
  async cities(@Query() query: unknown) {
    return this.catalogs.cities(this.parse(query));
  }

  @Get('industries')
  async industries(@Query() query: unknown) {
    return this.catalogs.industries(this.parse(query));
  }
}
