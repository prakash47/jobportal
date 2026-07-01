import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Button } from '@jobportal/ui';
import { isFlagEnabled } from '@jobportal/feature-flags';
import { ROLE_LABELS } from '../../../../lib/users/permissions';
import { AcceptInviteForm } from '../../../../components/users/AcceptInviteForm';

// SRS §4.9 — public invite-acceptance page (the token is the capability). Server
// component: validates the token API-side, then renders the setup form or an
// invalid state. L2 killswitch here; the accept endpoint (L3) is the trusted
// boundary. Lives in the (auth) route group (no requireRecruiter — the invitee
// has no account yet).

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface PageProps {
  params: Promise<{ token: string }>;
}

type Preview =
  | { valid: false }
  | { valid: true; email: string; companyName: string; companyRole: 'OWNER' | 'ADMIN' | 'MEMBER' };

async function preview(token: string): Promise<Preview> {
  try {
    const res = await fetch(
      `${API_URL}/recruiter/users/invite/${encodeURIComponent(token)}`,
      { cache: 'no-store' },
    );
    if (!res.ok) return { valid: false };
    return (await res.json()) as Preview;
  } catch {
    return { valid: false };
  }
}

export const dynamic = 'force-dynamic';

export default async function AcceptInvitePage({ params }: PageProps) {
  if (await isFlagEnabled('killswitch.recruiter_user_management')) notFound();
  const { token } = await params;
  const result = await preview(token);

  if (!result.valid) {
    return (
      <div className="space-y-4 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-fg)]">
          Invitation not valid
        </h1>
        <p className="text-sm text-[var(--color-fg-muted)]">
          This invitation may have expired, been revoked, or already been used. Ask your team admin
          to send a new one.
        </p>
        <Button asChild variant="secondary">
          <Link href="/login">Go to sign in</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-fg)]">
          Join {result.companyName}
        </h1>
        <p className="text-sm text-[var(--color-fg-muted)]">
          You&rsquo;ve been invited to join {result.companyName} on Career Queue as{' '}
          {ROLE_LABELS[result.companyRole]}. Set up your account to continue.
        </p>
      </header>
      <AcceptInviteForm token={token} email={result.email} />
    </div>
  );
}
