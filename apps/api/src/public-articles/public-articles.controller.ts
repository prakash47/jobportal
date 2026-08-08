import { BadRequestException, Controller, Get, Param, Query } from '@nestjs/common';
import { parseArticleIndexParams } from '@jobportal/domain/article-params';
import { ListArticlesQueryDto } from './dto';
import { PublicArticlesService } from './public-articles.service';

// Public — no guard, mirroring pages the website already serves to anyone.
// Both routes are PUBLISHED-only, enforced in the service.
@Controller({ path: 'career-advice', version: '1' })
export class PublicArticlesController {
  constructor(private readonly articles: PublicArticlesService) {}

  @Get()
  async list(@Query() query: unknown) {
    const parsed = ListArticlesQueryDto.safeParse(query);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    // Re-serialize for the shared parser, which owns the coercion rules.
    // Duplicating them here is the drift @jobportal/domain exists to prevent.
    const raw: Record<string, string | string[] | undefined> = {};
    if (parsed.data.tag !== undefined) raw['tag'] = parsed.data.tag;
    if (parsed.data.q !== undefined) raw['q'] = parsed.data.q;
    if (parsed.data.page !== undefined) raw['page'] = String(parsed.data.page);
    return this.articles.list(parseArticleIndexParams(raw));
  }

  // No slug-drift redirect here, unlike jobs and companies: Article.slug is the
  // primary key of the URL and has no numeric permalink behind it, so a changed
  // slug is a genuinely different article, not a drifted alias.
  @Get(':slug')
  async detail(@Param('slug') slug: string) {
    return this.articles.detail(slug);
  }
}
