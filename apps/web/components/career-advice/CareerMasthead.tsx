import Link from 'next/link';
import { ArticleSearch } from './ArticleSearch';
import { tagLabel } from './article-format';

export interface MastheadTopic {
  slug: string;
  count: number;
}

export interface CareerMastheadProps {
  topics: MastheadTopic[];
  activeTag: string | null;
  query: string | null;
  initialQuery?: string;
}

function topicHref(slug: string | null, q: string | null): string {
  const params = new URLSearchParams();
  if (slug) params.set('tag', slug);
  if (q) params.set('q', q);
  const qs = params.toString();
  return qs ? `/career-advice?${qs}` : '/career-advice';
}

// The editorial masthead: a small kicker, an oversized serif statement, a dek,
// the article search, and a topic pill row — all on light. Type carries the
// page. The pills are the topic nav (they wrap and stay usable on every
// breakpoint, so no separate mobile control is needed).
export function CareerMasthead({ topics, activeTag, query, initialQuery = '' }: CareerMastheadProps) {
  const pills: Array<{ key: string; slug: string | null; label: string }> = [
    { key: 'all', slug: null, label: 'All' },
    ...topics.map((t) => ({ key: t.slug, slug: t.slug, label: tagLabel(t.slug) })),
  ];

  return (
    <section className="border-b border-[var(--color-border)] pb-10">
      <div className="grid items-end gap-x-14 gap-y-8 lg:grid-cols-[1.5fr_0.95fr]">
        <div>
          <span className="inline-flex items-center gap-3 text-xs font-semibold uppercase tracking-[0.17em] text-[var(--color-accent-700)]">
            <span aria-hidden="true" className="h-0.5 w-6 bg-[var(--color-accent-500)]" />
            The Career Queue Editorial
          </span>
          <h1 className="font-editorial mt-5 font-semibold tracking-tight text-balance text-[var(--color-fg)]">
            <span className="block text-[clamp(2.8rem,6.5vw,5.5rem)] leading-[0.98]">Get hired,</span>
            <span className="block text-[clamp(2.8rem,6.5vw,5.5rem)] leading-[0.98]">
              on <em className="italic text-[var(--color-accent-700)]">purpose</em>.
            </span>
          </h1>
        </div>

        <div>
          <p className="max-w-[42ch] text-lg leading-relaxed text-[var(--color-fg-muted)]">
            Field-tested writing on resumes, interviews, and salary — from the people who see what
            recruiters actually do.
          </p>
          <div className="mt-5">
            <ArticleSearch initialQuery={initialQuery} />
          </div>
          <nav aria-label="Browse topics" className="mt-4 flex flex-wrap gap-2">
            {pills.map((p) => {
              const active = p.slug === activeTag;
              return (
                <Link
                  key={p.key}
                  href={topicHref(p.slug, query)}
                  aria-current={active ? 'true' : undefined}
                  className={
                    'rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors ' +
                    (active
                      ? 'border-[var(--color-primary-600)] bg-[var(--color-primary-600)] text-white'
                      : 'border-[var(--color-border-strong)] text-[var(--color-fg-muted)] hover:border-[var(--color-primary-300)] hover:text-[var(--color-fg)]')
                  }
                >
                  {p.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
    </section>
  );
}
