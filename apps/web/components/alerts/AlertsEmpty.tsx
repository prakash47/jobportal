import Link from 'next/link';

export function AlertsEmpty() {
  return (
    <div className="rounded-md border border-dashed border-[var(--color-border)] p-10 text-center">
      <p className="text-sm font-medium text-[var(--color-fg)]">No alerts yet</p>
      <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
        Set up an alert and we&rsquo;ll email you when matching jobs go live.
      </p>
      <Link
        href="/alerts/new"
        className="mt-4 inline-block text-sm font-medium text-[var(--color-primary-600)] hover:underline"
      >
        Create your first alert →
      </Link>
    </div>
  );
}
