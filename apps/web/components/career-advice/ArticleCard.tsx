import Link from 'next/link';
import Image from 'next/image';
import { authorInitials, formatArticleDate, tagLabel } from './article-format';

export interface ArticleCardProps {
  slug: string;
  title: string;
  excerpt: string | null;
  authorName: string;
  publishedAt: Date | null;
  readTimeMinutes: number | null;
  tags: string[];
  coverImageUrl: string | null;
}

// Editorial article tile — content-first, typographic. Cover is 16:9 when
// present; otherwise the card stays text-only (no decorative gradient block).
// The whole card is a stretched link to the read page. Flat surface, borders
// over shadows (CLAUDE.md §2). Shared with the homepage articles section, so it
// stays fluid + full-height for any grid column.
export function ArticleCard({
  slug,
  title,
  excerpt,
  authorName,
  publishedAt,
  readTimeMinutes,
  tags,
  coverImageUrl,
}: ArticleCardProps) {
  const category = tags[0];

  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-[var(--shadow-card)] transition-colors hover:border-[var(--color-border-strong)]">
      {coverImageUrl && (
        <div className="aspect-[16/9] w-full overflow-hidden border-b border-[var(--color-border)]">
          <Image
            src={coverImageUrl}
            alt=""
            width={640}
            height={360}
            className="size-full object-cover"
          />
        </div>
      )}
      <div className="flex flex-1 flex-col p-5">
        {category && (
          <span className="w-fit rounded-md bg-[var(--color-primary-100)] px-2 py-0.5 text-xs font-medium text-[var(--color-primary-800)]">
            {tagLabel(category)}
          </span>
        )}
        <h3 className="mt-3 text-[15px] font-semibold leading-snug tracking-tight text-[var(--color-fg)]">
          <Link
            href={`/career-advice/${slug}`}
            className="transition-colors after:absolute after:inset-0 after:content-[''] group-hover:text-[var(--color-primary-600)]"
          >
            {title}
          </Link>
        </h3>
        {excerpt && (
          <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-[var(--color-fg-muted)]">
            {excerpt}
          </p>
        )}
        <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 pt-4 text-xs text-[var(--color-fg-muted)]">
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="flex size-5 items-center justify-center rounded-full bg-[var(--color-primary-100)] text-[9px] font-semibold text-[var(--color-primary-700)]"
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
        </div>
      </div>
    </article>
  );
}
