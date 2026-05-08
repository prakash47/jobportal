import { cookies } from 'next/headers';
import { ACCESS_COOKIE } from '@jobportal/auth';
import { FeatureFlagsTable } from '../../../components/admin/FeatureFlagsTable';
import type { AdminFeatureFlag } from '../../../lib/admin/types';

export const dynamic = 'force-dynamic';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

async function fetchFlags(): Promise<AdminFeatureFlag[]> {
  const jar = await cookies();
  const token = jar.get(ACCESS_COOKIE)?.value;
  if (!token) return [];
  const res = await fetch(`${API_URL}/admin/feature-flags`, {
    headers: { cookie: `${ACCESS_COOKIE}=${token}` },
    cache: 'no-store',
  });
  if (!res.ok) {
    // Layout already enforces ADMIN; a 401/403 here means the API JWT
    // chain is wedged. Surface a hint by returning empty so the table
    // renders an empty state rather than crashing the page.
    return [];
  }
  return (await res.json()) as AdminFeatureFlag[];
}

export default async function FeatureFlagsPage() {
  const flags = await fetchFlags();
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-fg)]">
          Feature flags
        </h1>
        <p className="text-sm text-[var(--color-fg-muted)]">
          {flags.length} {flags.length === 1 ? 'flag' : 'flags'} across {countCategories(flags)}{' '}
          categories. Toggle a flag to apply immediately; an audit row is written for every
          change.
        </p>
      </header>
      <FeatureFlagsTable initial={flags} />
    </div>
  );
}

function countCategories(flags: AdminFeatureFlag[]): number {
  return new Set(flags.map((f) => f.category ?? 'uncategorized')).size;
}
