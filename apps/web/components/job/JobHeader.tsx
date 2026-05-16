import Link from 'next/link';
import { Breadcrumbs } from '@jobportal/ui';

function postedAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 14) return 'a week ago';
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  return `${Math.floor(days / 30)} months ago`;
}

export interface JobHeaderProps {
  title: string;
  companyName: string;
  companySlug: string;
  companyId: number;
  postedAt: string;
}

export function JobHeader({
  title,
  companyName,
  companySlug,
  companyId,
  postedAt,
}: JobHeaderProps) {
  return (
    <div className="space-y-4">
      <Breadcrumbs
        items={[
          { label: 'Home', href: '/' },
          { label: 'Jobs', href: '/jobs' },
          { label: title },
        ]}
      />
      <div className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-fg)] sm:text-3xl">
          {title}
        </h1>
        <p className="text-sm text-[var(--color-fg-muted)]">
          <Link
            href={`/company/${companySlug}-overview-${companyId}`}
            className="font-medium text-[var(--color-fg)] hover:underline"
          >
            {companyName}
          </Link>
          <span className="mx-2 text-[var(--color-fg-subtle)]">·</span>
          <span>Posted {postedAgo(postedAt)}</span>
        </p>
      </div>
    </div>
  );
}
