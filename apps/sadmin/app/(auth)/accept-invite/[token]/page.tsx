import type { Metadata } from 'next';
import Link from 'next/link';
import { ADMIN_STAFF_ROLE_LABEL } from '@jobportal/domain/admin-permissions';
import type { AdminStaffRole } from '@jobportal/db';
import { AcceptInviteForm } from '../../../../components/roles/AcceptInviteForm';

export const metadata: Metadata = {
  title: 'Accept your invitation — Career Queue Super Admin',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/**
 * The one public, account-creating route in this portal.
 *
 * ⚠ It lives in app/(auth)/, NOT app/(authed)/, and that is load-bearing twice
 * over. The (authed) layout runs requireAdminStaff(), which would bounce the
 * invitee to /login before they could accept — they have no session and no
 * account, which is the entire point. And lib/roles/scope-map.test.ts walks
 * app/(authed)/ only, so a page here is correctly never asked for a scope gate
 * it could not satisfy. The mechanism is geographic; there is no allowlist.
 *
 * There is no middleware work either: apps/sadmin's middleware does not
 * authenticate by design, so nothing needs relaxing for this path.
 */
interface PageProps {
  // Next 16: params is a promise and must be awaited.
  params: Promise<{ token: string }>;
}

type Preview = { valid: false } | { valid: true; email: string; staffRole: AdminStaffRole };

export default async function AcceptInvitePage({ params }: PageProps) {
  const { token } = await params;

  // Server-side preview so the page can name the tier before the invitee
  // commits to setting a password. A GET, and safe: it returns no token, writes
  // nothing, and answers a single indistinguishable { valid: false } for
  // unknown, revoked, accepted and expired alike.
  //
  // The API_URL fallback matches every other island in this portal —
  // NEXT_PUBLIC_API_URL is not set in apps/sadmin/.env, only in .env.example.
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
  let preview: Preview = { valid: false };
  try {
    const res = await fetch(
      `${apiUrl}/admin/staff/invite/${encodeURIComponent(token)}`,
      { cache: 'no-store' },
    );
    if (res.ok) preview = (await res.json()) as Preview;
  } catch {
    // A transport failure and an invalid token render the same card. That is a
    // deliberate simplification rather than an oversight: the remedy the invitee
    // has in both cases is identical — ask whoever invited them — and the API
    // being down is not a fact worth teaching an anonymous caller.
    preview = { valid: false };
  }

  if (!preview.valid) {
    // Deliberately NOT notFound(). A 404 here would strand someone holding a
    // link that expired an hour ago with no explanation and no next step — and
    // this portal has no not-found.tsx, so they would land on a bare Next 404
    // with none of the product's shell around it.
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-fg)]">
          This invitation is no longer valid
        </h1>
        <p className="text-sm text-[var(--color-fg-muted)]">
          It may have expired, already been used, or been withdrawn. Invitations are valid for 3
          days and can only be used once. Ask whoever invited you to send a new one.
        </p>
        <Link
          href="/login"
          className="inline-block rounded-md border border-[var(--color-border-strong)] px-3 py-2 text-sm font-medium text-[var(--color-fg)] transition-colors hover:bg-[var(--color-bg-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
        >
          Go to sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-fg)]">
          Set up your staff account
        </h1>
        <p className="text-sm text-[var(--color-fg-muted)]">
          You have been invited as{' '}
          <strong className="font-medium text-[var(--color-fg)]">
            {ADMIN_STAFF_ROLE_LABEL[preview.staffRole]}
          </strong>{' '}
          for {preview.email}. Choose a password to finish — nobody else sees it.
        </p>
      </header>

      <AcceptInviteForm token={token} email={preview.email} />
    </div>
  );
}
