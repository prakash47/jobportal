import Link from 'next/link';
import { ArrowRight, Bell, Briefcase } from '@jobportal/ui/icons';
import { formatArticleDate, tagLabel } from './article-format';

export interface SidebarTopic {
  slug: string;
  count: number;
}

export interface SidebarRecent {
  slug: string;
  title: string;
  publishedAt: Date | null;
}

export interface CareerSidebarProps {
  topics: SidebarTopic[];
  recent: SidebarRecent[];
  activeTag: string | null;
  /** Preserved across topic links so search + topic compose. */
  query: string | null;
}

function tagHref(slug: string | null, q: string | null): string {
  const params = new URLSearchParams();
  if (slug) params.set('tag', slug);
  if (q) params.set('q', q);
  const qs = params.toString();
  return qs ? `/career-advice?${qs}` : '/career-advice';
}

function SidebarCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4">
      <h2 className="text-sm font-semibold text-[var(--color-fg)]">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

// The lean editorial sidebar: browse-by-topic (real tags + counts), recently
// published (real), and one real cross-product CTA. Every widget is data-backed
// — no newsletter/authors/ads. Sticky is applied by the page wrapper.
export function CareerSidebar({ topics, recent, activeTag, query }: CareerSidebarProps) {
  return (
    <div className="space-y-4">
      {topics.length > 0 && (
        <SidebarCard title="Browse by topic">
          <ul className="space-y-0.5">
            <li>
              <Link
                href={tagHref(null, query)}
                aria-current={activeTag === null ? 'true' : undefined}
                className={
                  'flex items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors ' +
                  (activeTag === null
                    ? 'bg-[var(--color-primary-100)] font-medium text-[var(--color-primary-800)]'
                    : 'text-[var(--color-fg-muted)] hover:bg-[var(--color-bg-muted)] hover:text-[var(--color-fg)]')
                }
              >
                All topics
              </Link>
            </li>
            {topics.map((t) => {
              const active = t.slug === activeTag;
              return (
                <li key={t.slug}>
                  <Link
                    href={tagHref(t.slug, query)}
                    aria-current={active ? 'true' : undefined}
                    className={
                      'flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm transition-colors ' +
                      (active
                        ? 'bg-[var(--color-primary-100)] font-medium text-[var(--color-primary-800)]'
                        : 'text-[var(--color-fg-muted)] hover:bg-[var(--color-bg-muted)] hover:text-[var(--color-fg)]')
                    }
                  >
                    <span className="truncate">{tagLabel(t.slug)}</span>
                    <span className="shrink-0 tabular-nums text-[var(--color-fg-muted)]">{t.count}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </SidebarCard>
      )}

      {recent.length > 0 && (
        <SidebarCard title="Recently published">
          <ul className="space-y-3">
            {recent.map((a) => (
              <li key={a.slug}>
                <Link
                  href={`/career-advice/${a.slug}`}
                  className="block text-sm font-medium leading-snug text-[var(--color-fg)] hover:text-[var(--color-primary-600)] hover:underline"
                >
                  {a.title}
                </Link>
                {a.publishedAt && (
                  <p className="mt-0.5 text-xs text-[var(--color-fg-muted)]">
                    {formatArticleDate(a.publishedAt)}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </SidebarCard>
      )}

      {/* One real cross-product CTA — advice → action. */}
      <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-muted)] p-4">
        <h2 className="text-sm font-semibold text-[var(--color-fg)]">Ready to apply?</h2>
        <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
          Put the advice to work — find roles that match your skills.
        </p>
        <div className="mt-3 space-y-2">
          <Link
            href="/jobs"
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-[var(--color-primary-600)] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-primary-700)]"
          >
            <Briefcase className="size-4" aria-hidden="true" />
            Browse jobs
          </Link>
          <Link
            href="/alerts/new"
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-bg-elevated)] px-4 py-2 text-sm font-medium text-[var(--color-fg)] transition-colors hover:bg-[var(--color-bg-muted)]"
          >
            <Bell className="size-4" aria-hidden="true" />
            Set a job alert
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </Link>
        </div>
      </section>
    </div>
  );
}
