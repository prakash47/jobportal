import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight } from '@jobportal/ui/icons';
import { authorInitials, formatArticleDate, tagLabel } from './article-format';

export interface FeaturedArticleProps {
  slug: string;
  title: string;
  excerpt: string | null;
  authorName: string;
  publishedAt: Date | null;
  readTimeMinutes: number | null;
  tags: string[];
  coverImageUrl: string | null;
}

// The lead story — a visually dominant editorial card. Typographic by default
// (no article in the data carries a cover image); when a cover IS present it
// renders alongside the copy on desktop. Whole-card stretched link to the read
// page; borders over shadows, one flat accent (CLAUDE.md §2).
export function FeaturedArticle({
  slug,
  title,
  excerpt,
  authorName,
  publishedAt,
  readTimeMinutes,
  tags,
  coverImageUrl,
}: FeaturedArticleProps) {
  const href = `/career-advice/${slug}`;
  const category = tags[0];

  return (
    <article className="group relative overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-[var(--shadow-card)] transition-colors hover:border-[var(--color-border-strong)]">
      <div className={coverImageUrl ? 'grid lg:grid-cols-2' : ''}>
        {coverImageUrl && (
          <div className="aspect-[16/10] w-full overflow-hidden border-b border-[var(--color-border)] lg:aspect-auto lg:border-b-0 lg:border-r">
            <Image
              src={coverImageUrl}
              alt=""
              width={880}
              height={550}
              className="size-full object-cover"
            />
          </div>
        )}
        <div className="flex flex-col p-6 sm:p-8">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-[var(--color-accent-700)]">
              Featured
            </span>
            {category && (
              <>
                <span aria-hidden="true" className="text-[var(--color-fg-subtle)]">
                  ·
                </span>
                <span className="inline-flex items-center rounded-md bg-[var(--color-primary-100)] px-2 py-0.5 text-xs font-medium text-[var(--color-primary-800)]">
                  {tagLabel(category)}
                </span>
              </>
            )}
          </div>

          <h2 className="mt-3 text-2xl font-bold leading-tight tracking-tight text-[var(--color-fg)] sm:text-3xl">
            <Link
              href={href}
              className="transition-colors after:absolute after:inset-0 after:content-[''] group-hover:text-[var(--color-primary-600)]"
            >
              {title}
            </Link>
          </h2>

          {excerpt && (
            <p className="mt-3 max-w-[62ch] text-base leading-relaxed text-[var(--color-fg-muted)]">
              {excerpt}
            </p>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-[var(--color-fg-muted)]">
            <span className="inline-flex items-center gap-2">
              <span
                aria-hidden="true"
                className="flex size-7 items-center justify-center rounded-full bg-[var(--color-primary-100)] text-[11px] font-semibold text-[var(--color-primary-700)]"
              >
                {authorInitials(authorName)}
              </span>
              <span className="font-medium text-[var(--color-fg)]">{authorName}</span>
            </span>
            {publishedAt && (
              <>
                <span aria-hidden="true" className="text-[var(--color-fg-subtle)]">·</span>
                <span>{formatArticleDate(publishedAt)}</span>
              </>
            )}
            {readTimeMinutes !== null && (
              <>
                <span aria-hidden="true" className="text-[var(--color-fg-subtle)]">·</span>
                <span>{readTimeMinutes} min read</span>
              </>
            )}
            <span className="ml-auto inline-flex items-center gap-1 font-medium text-[var(--color-primary-600)]">
              Continue reading
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}
