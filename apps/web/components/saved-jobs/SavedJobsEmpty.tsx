import Link from 'next/link';

export function SavedJobsEmpty() {
  return (
    <div className="rounded-md border border-dashed border-[var(--color-border)] p-10 text-center">
      <p className="text-sm font-medium text-[var(--color-fg)]">No saved jobs yet</p>
      <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
        Bookmark roles you want to come back to.
      </p>
      <Link
        href="/jobs"
        className="mt-4 inline-block text-sm font-medium text-[var(--color-primary-600)] hover:underline"
      >
        Browse all jobs →
      </Link>
    </div>
  );
}
