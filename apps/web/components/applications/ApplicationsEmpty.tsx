import Link from 'next/link';

export function ApplicationsEmpty({ filtered }: { filtered: boolean }) {
  return (
    <div className="rounded-md border border-dashed border-[var(--color-border)] p-10 text-center">
      <p className="text-sm font-medium text-[var(--color-fg)]">
        {filtered ? 'Nothing matches this filter' : 'You haven’t applied to anything yet'}
      </p>
      <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
        {filtered ? 'Try a different status, or clear the filter.' : 'When you apply to a job it shows up here.'}
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
