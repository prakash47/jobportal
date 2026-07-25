import Link from 'next/link';
import type { ComponentType, SVGProps } from 'react';
import { ArrowRight, Check, Clock, FileText, Search, Users } from '@jobportal/ui/icons';
import { EXPIRING_SOON_DAYS } from '../../lib/dashboard/queries';

interface AttentionItem {
  key: string;
  count: number;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  /** Rendered as "{count} {text}". Pluralised by the builder. */
  text: string;
  href: string;
  cta: string;
}

// Things worth doing something about today. Only items with a real count render,
// so this panel shrinks to nothing rather than padding the page with zeroes —
// and when everything is genuinely handled it says so instead of disappearing.
export function AttentionList({
  newApplications,
  expiringSoon,
  activeWithNoApplicants,
  drafts,
}: {
  newApplications: number;
  expiringSoon: number;
  activeWithNoApplicants: number;
  drafts: number;
}) {
  const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

  const items: AttentionItem[] = [
    {
      key: 'new-applications',
      count: newApplications,
      icon: Users,
      text: `new ${plural(newApplications, 'application is', 'applications are')} waiting for a first review`,
      href: '/jobs',
      cta: 'Review',
    },
    {
      key: 'expiring',
      count: expiringSoon,
      icon: Clock,
      text: `open ${plural(expiringSoon, 'job expires', 'jobs expire')} within ${EXPIRING_SOON_DAYS} days`,
      href: '/jobs?status=ACTIVE',
      cta: 'Extend',
    },
    {
      key: 'no-applicants',
      count: activeWithNoApplicants,
      icon: Search,
      text: `open ${plural(activeWithNoApplicants, 'job has', 'jobs have')} no applicants yet`,
      href: '/jobs?status=ACTIVE',
      cta: 'Review',
    },
    {
      key: 'drafts',
      count: drafts,
      icon: FileText,
      text: `${plural(drafts, 'draft is', 'drafts are')} saved but not published`,
      href: '/jobs?status=DRAFT',
      cta: 'Publish',
    },
  ].filter((i) => i.count > 0);

  return (
    <section
      aria-labelledby="attention-heading"
      className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-5"
    >
      <h2 id="attention-heading" className="text-sm font-semibold text-[var(--color-fg)]">
        Needs your attention
      </h2>

      {items.length === 0 ? (
        <p className="mt-3 flex items-center gap-2 text-sm text-[var(--color-fg-muted)]">
          <Check
            className="size-4 shrink-0 text-[oklch(0.52_0.15_145)]"
            aria-hidden="true"
            strokeWidth={2.5}
          />
          Nothing needs attention right now.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-[var(--color-border)]">
          {items.map((item) => (
            <li key={item.key}>
              <Link
                href={item.href}
                className="group flex items-start gap-3 py-3 first:pt-0 last:pb-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ring)]"
              >
                <item.icon
                  className="mt-0.5 size-4 shrink-0 text-[var(--color-fg-muted)]"
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1 text-sm text-[var(--color-fg)]">
                  <span className="font-semibold tabular-nums">
                    {item.count.toLocaleString('en-IN')}
                  </span>{' '}
                  {item.text}
                </span>
                <span className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-[var(--color-primary-700)] underline-offset-4 group-hover:underline">
                  {item.cta}
                  <ArrowRight className="size-3.5" aria-hidden="true" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
