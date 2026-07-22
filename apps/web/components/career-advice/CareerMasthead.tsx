import { ArticleSearch } from './ArticleSearch';

export interface CareerMastheadProps {
  /** Total published stories (real) — shown in the issue-line. */
  total: number;
  /** Newest article's publish date (real) — the "Updated …" stamp. */
  latestDate: Date | null;
  initialQuery?: string;
}

// The magazine masthead: a hairline "issue-line" (identity + real issue stats),
// an oversized editorial wordmark, a one-line dek, and the article search. The
// issue framing is what makes a handful of posts read as a curated edition
// rather than a sparse blog list. Flat brand, borders over shadows.
export function CareerMasthead({ total, latestDate, initialQuery = '' }: CareerMastheadProps) {
  const updated = latestDate
    ? latestDate.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
    : null;

  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b-2 border-[var(--color-primary-600)] pb-2 text-[11px] font-semibold uppercase tracking-[0.16em]">
        <span className="text-[var(--color-accent-700)]">Career Queue · The Editorial</span>
        <span className="text-[var(--color-fg-muted)]">
          {total} {total === 1 ? 'story' : 'stories'}
          {updated && <> · Updated {updated}</>}
        </span>
      </div>

      <h1 className="mt-6 max-w-[16ch] text-4xl font-bold leading-[1.04] tracking-tight text-[var(--color-fg)] sm:text-5xl lg:text-6xl">
        Career advice, <span className="text-[var(--color-accent-700)]">worth reading</span>
      </h1>
      <p className="mt-4 max-w-[58ch] text-base leading-relaxed text-[var(--color-fg-muted)] sm:text-lg">
        Resumes, interviews, salary, and getting hired — written for job seekers in India.
      </p>

      <div className="mt-6">
        <ArticleSearch initialQuery={initialQuery} />
      </div>
    </section>
  );
}
