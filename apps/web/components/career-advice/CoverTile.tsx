import Link from 'next/link';
import { ArrowRight } from '@jobportal/ui/icons';
import { authorInitials, formatArticleDate, tagLabel } from './article-format';
import { ArticleCover } from './ArticleCover';

export interface CoverTileArticle {
  slug: string;
  title: string;
  excerpt: string | null;
  authorName: string;
  publishedAt: Date | null;
  readTimeMinutes: number | null;
  tags: string[];
  coverImageUrl: string | null;
}

export interface CoverTileProps {
  article: CoverTileArticle;
  size?: 'cover' | 'tile';
  /** Lead story is section-level (2); grid tiles nest under the grid's h2 (3). */
  headingLevel?: 2 | 3;
}

// A light, elevated editorial card: a cover image on top (or beside, for the
// lead), then a serif title, excerpt, and byline. Every article carries a cover
// (a real photo when present, otherwise a designed on-brand cover — see
// ArticleCover). Whole-card stretched link; depth + hover lift + a soft cover
// zoom. All-light surfaces, borders + elevation, one cyan accent.
export function CoverTile({ article, size = 'tile', headingLevel = 3 }: CoverTileProps) {
  const { slug, title, excerpt, authorName, publishedAt, readTimeMinutes, tags, coverImageUrl } =
    article;
  const href = `/career-advice/${slug}`;
  const category = tags[0];
  const isCover = size === 'cover';
  const Heading = headingLevel === 2 ? 'h2' : 'h3';

  const cover = (
    <div className={isCover ? 'relative min-h-[240px] overflow-hidden' : 'aspect-[16/9] overflow-hidden'}>
      <div className={`size-full transition-transform duration-300 ease-out group-hover:scale-[1.04] ${isCover ? 'absolute inset-0' : ''}`}>
        <ArticleCover coverImageUrl={coverImageUrl} tag={category} title={title} priority={isCover} />
      </div>
    </div>
  );

  const body = (
    <div className={`flex flex-1 flex-col ${isCover ? 'justify-center p-7 sm:p-10' : 'p-6'}`}>
      <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--color-accent-700)]">
        {isCover ? 'Featured story' : category ? tagLabel(category) : 'Article'}
      </span>
      <Heading
        className={`font-editorial mt-3 font-semibold tracking-tight text-balance text-[var(--color-fg)] transition-colors group-hover:text-[var(--color-primary-600)] ${
          isCover ? 'text-[clamp(1.6rem,2.6vw+0.6rem,2.75rem)] leading-[1.1]' : 'text-2xl leading-[1.16]'
        }`}
      >
        <Link href={href} className="after:absolute after:inset-0 after:content-['']">
          {title}
        </Link>
      </Heading>
      {excerpt && (
        <p className={`mt-3 leading-relaxed text-[var(--color-fg-muted)] ${isCover ? 'max-w-[46ch] text-base' : 'line-clamp-2 text-sm'}`}>
          {excerpt}
        </p>
      )}
      <div className="mt-auto flex flex-wrap items-center gap-x-2.5 gap-y-1 border-t border-[var(--color-border)] pt-4 text-[13px] text-[var(--color-fg-muted)]">
        <span className="inline-flex items-center gap-2">
          <span aria-hidden="true" className="flex size-6 items-center justify-center rounded-full bg-[var(--color-accent-50)] text-[10px] font-semibold text-[var(--color-accent-700)]">
            {authorInitials(authorName)}
          </span>
          <span className="font-medium text-[var(--color-fg)]">{authorName}</span>
        </span>
        {publishedAt && (
          <>
            <span aria-hidden="true">·</span>
            <span>{formatArticleDate(publishedAt)}</span>
          </>
        )}
        {readTimeMinutes !== null && (
          <>
            <span aria-hidden="true">·</span>
            <span>{readTimeMinutes} min read</span>
          </>
        )}
        {isCover && (
          <span className="ml-auto inline-flex items-center gap-1 font-semibold text-[var(--color-primary-600)]">
            Read the story
            <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </span>
        )}
      </div>
    </div>
  );

  return (
    <article
      className={`group relative overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-[var(--shadow-card)] transition-[transform,box-shadow,border-color] duration-200 ease-out hover:-translate-y-1 hover:border-[var(--color-border-strong)] hover:shadow-[var(--shadow-lift)] ${
        isCover ? 'grid sm:grid-cols-2' : 'flex h-full flex-col'
      }`}
    >
      {isCover ? (
        <>
          <div className="order-1 border-b border-[var(--color-border)] sm:order-none sm:border-b-0 sm:border-r">{cover}</div>
          {body}
        </>
      ) : (
        <>
          <div className="border-b border-[var(--color-border)]">{cover}</div>
          {body}
        </>
      )}
    </article>
  );
}
