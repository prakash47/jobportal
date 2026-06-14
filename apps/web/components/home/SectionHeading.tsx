import Link from 'next/link';
import { ArrowRight } from '@jobportal/ui/icons';

interface SectionHeadingProps {
  eyebrow: string;
  title: string;
  description?: string;
  cta?: { label: string; href: string };
}

// Shared section heading — eyebrow (CAPS, tracked) above title, optional
// supporting copy below, optional CTA right-aligned. Same hierarchy used by
// Stripe / Vercel section intros: small label → confident title → muted body.

export function SectionHeading({ eyebrow, title, description, cta }: SectionHeadingProps) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:mb-10 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-2xl space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wider text-[var(--color-primary-600)]">
          {eyebrow}
        </div>
        <h2 className="text-2xl font-semibold tracking-tight text-[var(--color-fg)] sm:text-3xl">
          {title}
        </h2>
        {description && (
          <p className="text-sm leading-relaxed text-[var(--color-fg-muted)] sm:text-base">
            {description}
          </p>
        )}
      </div>
      {cta && (
        <Link
          href={cta.href}
          className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-[var(--color-primary-600)] hover:text-[var(--color-primary-700)] hover:underline"
        >
          {cta.label}
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}
