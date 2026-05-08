import Image from 'next/image';
import { Badge, Breadcrumbs } from '@jobportal/ui';

const fmtDate = (d: Date) =>
  d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

export interface ArticleHeroProps {
  title: string;
  excerpt: string | null;
  authorName: string;
  publishedAt: Date | null;
  readTimeMinutes: number | null;
  tags: string[];
  coverImageUrl: string | null;
}

// Notion-published / Stripe-blog hero: title large but not loud, single-line
// meta row underneath, optional cover image follows. No drop shadow, no
// gradient overlay (CLAUDE.md §2).
export function ArticleHero({
  title,
  excerpt,
  authorName,
  publishedAt,
  readTimeMinutes,
  tags,
  coverImageUrl,
}: ArticleHeroProps) {
  return (
    <header className="space-y-6">
      <Breadcrumbs
        items={[
          { label: 'Home', href: '/' },
          { label: 'Career advice', href: '/career-advice' },
          { label: title },
        ]}
      />
      <div className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight text-[var(--color-fg)] sm:text-4xl">
          {title}
        </h1>
        {excerpt && (
          <p className="text-lg leading-relaxed text-[var(--color-fg-muted)]">{excerpt}</p>
        )}
        <p className="text-sm text-[var(--color-fg-subtle)]">
          By <span className="font-medium text-[var(--color-fg)]">{authorName}</span>
          {publishedAt && (
            <>
              <span className="mx-2">·</span>
              {fmtDate(publishedAt)}
            </>
          )}
          {readTimeMinutes !== null && (
            <>
              <span className="mx-2">·</span>
              {readTimeMinutes} min read
            </>
          )}
        </p>
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {tags.map((t) => (
              <Badge key={t} variant="neutral">
                {t}
              </Badge>
            ))}
          </div>
        )}
      </div>
      {coverImageUrl && (
        <div className="overflow-hidden rounded-lg border border-[var(--color-border)]">
          <Image
            src={coverImageUrl}
            alt=""
            width={1280}
            height={720}
            priority
            className="size-full object-cover"
          />
        </div>
      )}
    </header>
  );
}
