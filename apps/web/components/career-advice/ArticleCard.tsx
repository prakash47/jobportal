import Link from 'next/link';
import Image from 'next/image';
import { Badge, Card, CardContent, CardHeader } from '@jobportal/ui';

const fmtDate = (d: Date) =>
  d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

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

// Stripe-blog tile: confident, content-first. Cover is 16:9 if present;
// otherwise the card stays text-only — no decorative gradient block.
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
  return (
    <Card className="overflow-hidden transition-colors hover:border-[var(--color-border-strong)]">
      {coverImageUrl && (
        <Link href={`/career-advice/${slug}`} className="block">
          <div className="aspect-[16/9] w-full overflow-hidden border-b border-[var(--color-border)]">
            <Image
              src={coverImageUrl}
              alt=""
              width={640}
              height={360}
              className="size-full object-cover"
            />
          </div>
        </Link>
      )}
      <CardHeader className="gap-2">
        <Link
          href={`/career-advice/${slug}`}
          className="text-base font-semibold leading-snug tracking-tight text-[var(--color-fg)] hover:underline"
        >
          {title}
        </Link>
        {excerpt && (
          <p className="line-clamp-3 text-sm text-[var(--color-fg-muted)]">{excerpt}</p>
        )}
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        <p className="text-xs text-[var(--color-fg-subtle)]">
          {authorName}
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
          <div className="flex flex-wrap gap-1.5">
            {tags.slice(0, 3).map((t) => (
              <Badge key={t} variant="neutral">
                {t}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
