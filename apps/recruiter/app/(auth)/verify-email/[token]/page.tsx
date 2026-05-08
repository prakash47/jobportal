import Link from 'next/link';
import { Button } from '@jobportal/ui';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface PageProps {
  params: Promise<{ token: string }>;
}

// Server component — calls the API server-side so the result is committed
// before the page renders. Idempotent: re-visiting after success shows the
// same confirmation. Pre-fetcher safe (positive + repeatable action).

interface VerifyResult {
  ok: boolean;
  message?: string;
}

async function verify(token: string): Promise<VerifyResult> {
  try {
    const res = await fetch(
      `${API_URL}/auth/recruiter/verify-work-email?token=${encodeURIComponent(token)}`,
      { cache: 'no-store' },
    );
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      return { ok: false, message: body.message ?? 'Verification failed' };
    }
    return { ok: true };
  } catch {
    return { ok: false, message: 'Network error — please try again from your inbox.' };
  }
}

export default async function VerifyEmailPage({ params }: PageProps) {
  const { token } = await params;
  const result = await verify(token);

  if (!result.ok) {
    return (
      <div className="space-y-4 text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-fg)]">
          Link not recognised
        </h1>
        <p className="text-sm text-[var(--color-fg-muted)]">
          {result.message ?? 'This verification link may have expired.'}
        </p>
        <Button asChild variant="secondary">
          <Link href="/dashboard">Go to dashboard</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4 text-center">
      <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-fg)]">
        Work email verified
      </h1>
      <p className="text-sm text-[var(--color-fg-muted)]">
        Thanks — we&rsquo;ve confirmed access to your work address.
      </p>
      <Button asChild>
        <Link href="/dashboard">Continue to dashboard</Link>
      </Button>
    </div>
  );
}
