import { ArticleSearch } from './ArticleSearch';

// Editorial hub header — eyebrow, confident headline, one-line promise, and the
// article search. Content-first and calm (no oversized illustration), matching
// the flat brand. The search is the only interactive element up top.
export function CareerHero({ initialQuery = '' }: { initialQuery?: string }) {
  return (
    <section className="border-b border-[var(--color-border)] pb-8">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-accent-700)]">
        Career advice
      </p>
      <h1 className="mt-2 max-w-[18ch] text-3xl font-bold tracking-tight text-[var(--color-fg)] sm:text-4xl lg:text-[2.75rem] lg:leading-[1.1]">
        Career advice and professional insights
      </h1>
      <p className="mt-3 max-w-[60ch] text-base leading-relaxed text-[var(--color-fg-muted)] sm:text-lg">
        Expert guidance on resumes, interviews, salary, and getting hired — written for job
        seekers in India.
      </p>
      <div className="mt-6">
        <ArticleSearch initialQuery={initialQuery} />
      </div>
    </section>
  );
}
