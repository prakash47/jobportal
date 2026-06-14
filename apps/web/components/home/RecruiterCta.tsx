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
      <div className="rounded-lg border border-[var(--color-primary-200)] bg-[var(--color-primary-50)] p-8 sm:p-12">
        <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-2xl space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-[var(--color-primary-600)]">
              For recruiters
            </div>
            <h2 className="text-2xl font-semibold tracking-tight text-[var(--color-fg)] sm:text-3xl">
              Hire on JobPortal.
            </h2>
            <p className="text-sm leading-relaxed text-[var(--color-fg-muted)] sm:text-base">
              Post roles, manage applicants, and reach candidates on the same network
              that they trust. Free to start.
            </p>
          </div>
          <Button asChild variant="primary" size="lg">
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
