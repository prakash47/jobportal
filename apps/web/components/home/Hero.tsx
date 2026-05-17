import Link from 'next/link';
import { Button } from '@jobportal/ui';
import { ArrowRight } from '@jobportal/ui/icons';
import { SearchInput } from '../header/SearchInput';

interface HeroProps {
  activeJobsCount: number;
}

// Linear/Stripe-style hero: oversized restrained type, single accent, one
// affordance (the search). The chip above the heading is a quiet
// trust-signal — same idea as Stripe's "$1 trillion processed" in their
// homepage hero — but the number is live (passed in from SSR), not a
// marketing claim. Calm, no gradients, no illustration.

const fmt = (n: number) => n.toLocaleString('en-IN');

export function Hero({ activeJobsCount }: HeroProps) {
  return (
    <section className="px-4 pt-20 pb-12 sm:px-6 sm:pt-28 sm:pb-16 lg:pt-32">
      <div className="mx-auto max-w-3xl text-center">
        <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-3 py-1">
          <span
            className="size-1.5 rounded-full bg-[var(--color-success)]"
            aria-hidden="true"
          />
          <span className="text-xs text-[var(--color-fg-muted)]">
            {fmt(activeJobsCount)} active roles today
          </span>
        </div>

        <h1 className="text-balance text-4xl font-semibold tracking-tight text-[var(--color-fg)] sm:text-5xl lg:text-6xl">
          Find work that fits your life.
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-balance text-base leading-relaxed text-[var(--color-fg-muted)] sm:text-lg">
          A calmer way to search jobs across India. No ads, no clutter — just
          openings that match your skills, city, and experience.
        </p>

        <div className="mx-auto mt-10 max-w-2xl">
          <SearchInput size="lg" />
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-sm">
          <Button asChild variant="ghost" size="sm">
            <Link href="/jobs">
              Browse all jobs
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </Button>
          <Link
            href="/register"
            className="text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
          >
            Create a free account
          </Link>
        </div>
      </div>
    </section>
  );
}
