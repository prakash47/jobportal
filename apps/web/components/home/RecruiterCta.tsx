import { Button } from '@jobportal/ui';
import { ArrowRight } from '@jobportal/ui/icons';

// Single calm panel at the foot of the page — same restraint as the rest of
// the homepage. Links out to the recruiter app on a sibling subdomain in
// prod; localhost:3001 in dev. No pricing copy — Day-0 stance is freemium
// (CLAUDE.md §0): every paid feature ships OFF, /pricing 404s.

const RECRUITER_URL = process.env.NEXT_PUBLIC_RECRUITER_URL ?? 'http://localhost:3001';

export function RecruiterCta() {
  return (
    <section className="mx-auto w-full max-w-[var(--container-max)] px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
      <div className="relative overflow-hidden rounded-2xl bg-[image:var(--gradient-brand)] p-8 shadow-[var(--shadow-float)] ring-1 ring-white/15 sm:p-12">
        {/* The page's one maximal moment — full navy→cyan gradient with a bright
            cyan corner glow. Text sits on the navy-dominant region (left). */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-20 -top-20 size-72 rounded-full"
          style={{ background: 'var(--color-accent-500)', opacity: 0.22, filter: 'blur(56px)' }}
        />
        <div className="relative flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-2xl space-y-2">
            <div className="flex items-center gap-2.5">
              <span className="h-px w-6 bg-[var(--color-accent-500)]" aria-hidden="true" />
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-accent-400)]">
                For recruiters
              </span>
            </div>
            <h2 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              Hire on JobPortal.
            </h2>
            <p className="text-sm leading-relaxed text-[var(--color-primary-100)] sm:text-base">
              Post roles, manage applicants, and reach candidates on the same network
              that they trust. Free to start.
            </p>
            <div className="flex flex-wrap gap-2">
              {['Free to start', 'No card required'].map((chip) => (
                <span
                  key={chip}
                  className="inline-flex items-center rounded-full border border-white/15 px-2.5 py-1 text-xs text-[var(--color-primary-100)]"
                >
                  {chip}
                </span>
              ))}
            </div>
          </div>
          <Button
            asChild
            size="lg"
            className="shrink-0 bg-white text-[var(--color-primary-700)] transition-[transform,background-color] hover:-translate-y-0.5 hover:bg-[var(--color-primary-100)] motion-reduce:hover:translate-y-0"
          >
            <a href={`${RECRUITER_URL}/register`}>
              Open the recruiter portal
              <ArrowRight className="size-4" aria-hidden="true" />
            </a>
          </Button>
        </div>
      </div>
    </section>
  );
}
