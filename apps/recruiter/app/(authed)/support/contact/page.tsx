import { notFound } from 'next/navigation';
import { prisma } from '@jobportal/db';
import { isFlagEnabled } from '@jobportal/feature-flags';
import { requireRecruiter } from '../../../../lib/auth/require-recruiter';
import { ContactForm } from '../../../../components/support/ContactForm';

// Help & Support → Contact us. A one-off message form. Reads the recruiter's
// name + email directly via Prisma to prefill the form (reads/writes split);
// the mutation goes through the BFF. L2 killswitch gate.

export const dynamic = 'force-dynamic';

export default async function ContactPage() {
  if (await isFlagEnabled('killswitch.recruiter_help_support')) notFound();
  const user = await requireRecruiter();

  const me = await prisma.user.findUnique({
    where: { id: user.sub },
    select: { name: true, email: true },
  });

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-fg)]">Contact us</h1>
        <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
          Send us a message and we&rsquo;ll get back to you by email. For an issue you want to
          track, raise a ticket instead.
        </p>
      </header>

      <ContactForm initialName={me?.name ?? ''} initialEmail={me?.email ?? ''} />
    </div>
  );
}
