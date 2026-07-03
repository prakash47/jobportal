import { notFound } from 'next/navigation';
import { isFlagEnabled } from '@jobportal/feature-flags';
import { requireRecruiter } from '../../../../lib/auth/require-recruiter';
import { FaqPanel } from '../../../../components/support/FaqPanel';

// Help & Support → FAQ. Static, searchable content (no DB). L2 of the killswitch
// lives here — if an admin flips killswitch.recruiter_help_support ON the page
// 404s (the API is the L3 boundary for the ticket/contact mutations).

export const dynamic = 'force-dynamic';

export default async function FaqPage() {
  if (await isFlagEnabled('killswitch.recruiter_help_support')) notFound();
  await requireRecruiter();

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-fg)]">
          Frequently asked questions
        </h1>
        <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
          Quick answers about using the recruiter portal. Can&rsquo;t find what you need? Contact us
          or raise a ticket.
        </p>
      </header>

      <FaqPanel />
    </div>
  );
}
