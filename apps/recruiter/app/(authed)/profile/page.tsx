import { prisma } from '@jobportal/db';
import { Badge } from '@jobportal/ui';
import { readUserFromCookie } from '../../../lib/auth/server-session';

const fmtDate = (d: Date) =>
  d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

// Read-only profile view. Editing lands with the recruiter portal next
// iteration; this page surfaces the data the registration captured plus the
// derived company link so the recruiter can confirm what we've stored.

export default async function ProfilePage() {
  const session = (await readUserFromCookie())!;
  const recruiter = await prisma.recruiter.findUnique({
    where: { userId: session.sub },
    select: {
      designation: true,
      contactPhone: true,
      workEmail: true,
      workEmailVerified: true,
      createdAt: true,
      user: { select: { name: true, email: true } },
      company: { select: { name: true, slug: true } },
    },
  });

  if (!recruiter) {
    return (
      <div className="rounded-md border border-dashed border-[var(--color-border)] p-10 text-center text-sm text-[var(--color-fg-muted)]">
        Recruiter profile not found. If you just registered, please reload.
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-fg)]">Profile</h1>
        <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
          What we know about you. Editing lands in the next release.
        </p>
      </header>

      <dl className="space-y-4 rounded-md border border-[var(--color-border)] p-6">
        <Field label="Name" value={recruiter.user.name} />
        <Field label="Login email" value={recruiter.user.email} />
        <Field
          label="Work email"
          value={
            <span className="flex items-center gap-2">
              {recruiter.workEmail}
              {recruiter.workEmailVerified ? (
                <Badge variant="success">Verified</Badge>
              ) : (
                <Badge variant="warning">Unverified</Badge>
              )}
            </span>
          }
        />
        <Field label="Company" value={recruiter.company.name} />
        {recruiter.designation && <Field label="Designation" value={recruiter.designation} />}
        {recruiter.contactPhone && <Field label="Contact phone" value={recruiter.contactPhone} />}
        <Field label="Joined" value={fmtDate(recruiter.createdAt)} />
      </dl>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-1 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-4">
      <dt className="text-sm text-[var(--color-fg-muted)]">{label}</dt>
      <dd className="text-sm text-[var(--color-fg)]">{value}</dd>
    </div>
  );
}
