import Link from 'next/link';
import { Button } from '@jobportal/ui';
import { Bell, Briefcase } from '@jobportal/ui/icons';

export interface CompanyHiringRailProps {
  companyName: string;
  activeJobs: number;
}

// Right-rail conversion card: the company's live hiring state plus the two
// actions a seeker actually wants here — jump to the roles, or get alerted
// when new ones open. `/alerts/new` is the real alerts entry point.
export function CompanyHiringRail({ companyName, activeJobs }: CompanyHiringRailProps) {
  const hiring = activeJobs > 0;

  return (
    <section
      aria-label="Hiring"
      className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-4"
    >
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className={
            'size-2 rounded-full ' +
            (hiring ? 'bg-[var(--color-success)]' : 'bg-[var(--color-fg-subtle)]')
          }
        />
        <h2 className="text-sm font-semibold text-[var(--color-fg)]">
          {hiring ? 'Hiring now' : 'Not hiring right now'}
        </h2>
      </div>

      {hiring ? (
        <>
          <p className="mt-3 text-3xl font-semibold tabular-nums text-[var(--color-fg)]">
            {activeJobs.toLocaleString('en-IN')}
          </p>
          <p className="text-sm text-[var(--color-fg-muted)]">
            open {activeJobs === 1 ? 'role' : 'roles'}
          </p>
          <Button asChild variant="primary" size="sm" className="mt-4 w-full">
            <a href="#openings">
              <Briefcase className="size-4" aria-hidden="true" />
              <span>View all jobs</span>
            </a>
          </Button>
        </>
      ) : (
        <p className="mt-2 text-sm text-[var(--color-fg-muted)]">
          {companyName} has no live openings. Set an alert and we&rsquo;ll email you when a role goes
          live.
        </p>
      )}

      <Button asChild variant="secondary" size="sm" className="mt-2 w-full">
        <Link href="/alerts/new">
          <Bell className="size-4" aria-hidden="true" />
          <span>Set a job alert</span>
        </Link>
      </Button>
    </section>
  );
}
