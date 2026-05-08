import { Button } from '@jobportal/ui';

// Empty state — the list + wizard land in Task 17.
export default function JobsPage() {
  return (
    <div className="space-y-8">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-fg)]">Jobs</h1>
          <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
            Active, draft, and closed jobs from your team.
          </p>
        </div>
        <Button variant="primary" disabled title="Job posting wizard arrives in the next release">
          Post a job
        </Button>
      </header>

      <div className="rounded-md border border-dashed border-[var(--color-border)] p-10 text-center">
        <p className="text-sm font-medium text-[var(--color-fg)]">No jobs posted yet</p>
        <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
          Once you post a job, you&rsquo;ll see it here with applicant counts and status.
        </p>
      </div>
    </div>
  );
}
