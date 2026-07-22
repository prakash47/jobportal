import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight } from '@jobportal/ui/icons';
import { authorInitials, formatArticleDate, tagLabel } from './article-format';
import { VARIANT_STYLES, coverVariant, topicGlyph, type CoverVariant } from './article-visuals';

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
  /** 1-indexed recency rank, shown as a decorative "01/02/…" folio. */
  folio: number;
  size?: 'cover' | 'tile';
  /** Force a field variant (the lead uses 'ink'); defaults to a per-slug hash. */
  variant?: CoverVariant;
}

// A designed magazine "cover plate" for image-less articles: a flat navy/tint
// field + a large per-topic glyph + a decorative bled folio numeral + a flat
// SVG dot texture + one cyan editorial rule + the title set big as the artwork.
// 100% real metadata, no fabricated photo, no gradient. Renders a real cover
// image when one exists. The whole plate is a stretched link to the read page.
export function CoverTile({ article, folio, size = 'tile', variant }: CoverTileProps) {
  const { slug, title, excerpt, authorName, publishedAt, readTimeMinutes, tags, coverImageUrl } =
    article;
  const href = `/career-advice/${slug}`;
  const category = tags[0];
  const isCover = size === 'cover';

  // Image-ready: if a real cover exists, use the photo path (image on top +
  // editorial copy below on a flat card). None of the seeded articles have one.
  if (coverImageUrl) {
    return (
      <article className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-[var(--shadow-card)] transition-colors hover:border-[var(--color-border-strong)]">
        <div className={`w-full overflow-hidden border-b border-[var(--color-border)] ${isCover ? 'aspect-[21/9]' : 'aspect-[16/9]'}`}>
          <Image src={coverImageUrl} alt="" width={1120} height={480} className="size-full object-cover" />
        </div>
        <div className="flex flex-1 flex-col p-5 sm:p-6">
          {category && (
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-accent-700)]">
              {tagLabel(category)}
            </span>
          )}
          <h3 className={`mt-2 font-bold leading-tight tracking-tight text-[var(--color-fg)] ${isCover ? 'text-2xl sm:text-3xl' : 'text-lg'}`}>
            <Link href={href} className="transition-colors after:absolute after:inset-0 after:content-[''] group-hover:text-[var(--color-primary-600)]">
              {title}
            </Link>
          </h3>
          {excerpt && <p className="mt-2 line-clamp-2 text-sm text-[var(--color-fg-muted)]">{excerpt}</p>}
          <MetaRow
            authorName={authorName}
            publishedAt={publishedAt}
            readTimeMinutes={readTimeMinutes}
            seam="border-[var(--color-border)]"
            meta="text-[var(--color-fg-muted)]"
            metaChip="bg-[var(--color-primary-100)] text-[var(--color-primary-700)]"
            showCta={isCover}
            ctaClass="text-[var(--color-primary-600)]"
          />
        </div>
      </article>
    );
  }

  // Index Plate (the designed cover for image-less articles).
  const v = variant ?? coverVariant(slug);
  const s = VARIANT_STYLES[v];
  const Glyph = topicGlyph(category);
  const dotsId = `covdots-${slug}`;
  const folioLabel = String(folio).padStart(2, '0');

  return (
    <article
      className={`group relative flex h-full flex-col overflow-hidden rounded-2xl shadow-[var(--shadow-card)] transition-colors ${s.field} ${isCover ? 'min-h-[21rem] p-6 sm:p-8 lg:min-h-[24rem]' : 'min-h-[13rem] p-5 sm:p-6'}`}
    >
      {/* Flat dot texture — a vector <pattern>, deliberately NOT a gradient. */}
      {s.dot && (
        <svg aria-hidden="true" className="pointer-events-none absolute inset-0 size-full">
          <defs>
            <pattern id={dotsId} width="16" height="16" patternUnits="userSpaceOnUse">
              <circle cx="2" cy="2" r="1.3" fill={s.dot} />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill={`url(#${dotsId})`} />
        </svg>
      )}
      {/* Cyan editorial rule (the one deliberate accent), on the 'rule' variant. */}
      {s.topBar && <div aria-hidden="true" className={`absolute inset-x-0 top-0 h-[3px] ${s.topBar}`} />}
      {/* Large per-topic glyph — the visual anchor, opposite the numeral. */}
      <Glyph
        aria-hidden="true"
        className={`pointer-events-none absolute -right-2 -top-3 ${s.glyph} ${isCover ? 'size-56 sm:size-72' : 'size-32'}`}
      />
      {/* Decorative bled folio numeral (recency rank, NOT a step). */}
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute -bottom-2 left-3 font-bold tabular-nums leading-none ${s.numeral} ${isCover ? 'text-[7rem] sm:text-[9rem]' : 'text-[4.5rem]'}`}
      >
        {folioLabel}
      </span>

      <div className={`relative flex flex-1 flex-col ${isCover ? 'max-w-[46ch]' : ''}`}>
        {category && (
          <span className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${s.kicker}`}>
            {tagLabel(category)}
          </span>
        )}
        <h3
          className={`mt-3 font-bold tracking-tight text-balance ${s.title} ${s.titleHover} transition-colors ${
            isCover ? 'text-[clamp(1.9rem,3.4vw+0.6rem,3.6rem)] leading-[1.05]' : 'text-2xl leading-[1.12]'
          }`}
        >
          <Link href={href} className="after:absolute after:inset-0 after:content-['']">
            {title}
          </Link>
        </h3>
        {excerpt && (
          <p className={`mt-3 text-sm leading-relaxed ${s.excerpt} ${isCover ? 'line-clamp-3' : 'line-clamp-2'}`}>
            {excerpt}
          </p>
        )}
        <MetaRow
          authorName={authorName}
          publishedAt={publishedAt}
          readTimeMinutes={readTimeMinutes}
          seam={s.seam}
          meta={s.meta}
          metaChip={s.metaChip}
          showCta={isCover}
          ctaClass={v === 'ink' ? 'text-[var(--color-accent-400)]' : 'text-[var(--color-primary-600)]'}
        />
      </div>
    </article>
  );
}

function MetaRow({
  authorName,
  publishedAt,
  readTimeMinutes,
  seam,
  meta,
  metaChip,
  showCta,
  ctaClass,
}: {
  authorName: string;
  publishedAt: Date | null;
  readTimeMinutes: number | null;
  seam: string;
  meta: string;
  metaChip: string;
  showCta: boolean;
  ctaClass: string;
}) {
  return (
    <div className={`mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 border-t pt-3 text-xs ${seam} ${meta}`}>
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden="true" className={`flex size-5 items-center justify-center rounded-full text-[9px] font-semibold ${metaChip}`}>
          {authorInitials(authorName)}
        </span>
        <span className="font-medium">{authorName}</span>
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
      {showCta && (
        <span className={`ml-auto inline-flex items-center gap-1 font-medium ${ctaClass}`}>
          Continue reading
          <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </span>
      )}
    </div>
  );
}
