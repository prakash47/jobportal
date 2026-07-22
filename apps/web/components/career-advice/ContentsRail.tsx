import Link from 'next/link';
import { tagLabel } from './article-format';

export interface ContentsRailTopic {
  slug: string;
  count: number;
}

export interface ContentsRailProps {
  topics: ContentsRailTopic[];
  activeTag: string | null;
  /** Preserved across topic links so search + topic compose. */
  query: string | null;
}

function topicHref(slug: string | null, q: string | null): string {
  const params = new URLSearchParams();
  if (slug) params.set('tag', slug);
  if (q) params.set('q', q);
  const qs = params.toString();
  return qs ? `/career-advice?${qs}` : '/career-advice';
}

// The magazine "contents" bar: the real topics as an uppercase, letterspaced
// editorial index with counts + an active state. Desktop-only (the page falls
// back to the TagFilter chip row on mobile). URL-driven; the active topic wears
// a navy fill (the one nav accent, kept flat — no cyan-tint surfaces).
export function ContentsRail({ topics, activeTag, query }: ContentsRailProps) {
  if (topics.length === 0) return null;

  const items: Array<{ key: string; slug: string | null; label: string; count: number | null }> = [
    { key: 'all', slug: null, label: 'All', count: null },
    ...topics.map((t) => ({ key: t.slug, slug: t.slug, label: tagLabel(t.slug), count: t.count })),
  ];

  return (
    <nav
      aria-label="Browse topics"
      className="flex flex-wrap items-center gap-x-1 gap-y-2 border-b border-[var(--color-border)] pb-3 text-[11px] font-semibold uppercase tracking-[0.14em]"
    >
      {items.map((it) => {
        const active = it.slug === activeTag;
        return (
          <Link
            key={it.key}
            href={topicHref(it.slug, query)}
            aria-current={active ? 'true' : undefined}
            className={
              'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 transition-colors ' +
              (active
                ? 'bg-[var(--color-primary-600)] text-white'
                : 'text-[var(--color-fg-muted)] hover:bg-[var(--color-bg-muted)] hover:text-[var(--color-fg)]')
            }
          >
            {it.label}
            {it.count !== null && (
              <span className={active ? 'text-[var(--color-primary-100)]' : 'text-[var(--color-fg-muted)]'}>
                {it.count}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
