import Link from 'next/link';
import { prisma } from '@jobportal/db';

const TOP_N = 10;

interface OpeningRow {
  id: number;
  title: string;
  canonicalSlug: string;
  primaryCityName: string | null;
  postedAt: Date;
}

const fmt = (d: Date) => {
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
  return `${Math.floor(days / 30)} months ago`;
};

export async function CompanyOpenings({
  companyId,
  totalActive,
}: {
  companyId: number;
  totalActive: number;
}) {
  const rows: OpeningRow[] = await prisma.job
    .findMany({
      where: { companyId, status: 'ACTIVE' },
      orderBy: { postedAt: 'desc' },
      take: TOP_N,
      select: {
        id: true,
        title: true,
        canonicalSlug: true,
        postedAt: true,
        primaryCity: { select: { name: true } },
      },
    })
    .then((arr) =>
      arr.map((j) => ({
        id: j.id,
        title: j.title,
        canonicalSlug: j.canonicalSlug,
        postedAt: j.postedAt,
        primaryCityName: j.primaryCity?.name ?? null,
      })),
    );

  return (
    <section aria-label="Current openings" className="space-y-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold text-[var(--color-fg)]">Current openings</h2>
        <span className="text-sm text-[var(--color-fg-muted)]">
          {totalActive === 0
            ? 'No openings'
            : totalActive === 1
              ? '1 open role'
              : `${totalActive} open roles`}
        </span>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-md border border-dashed border-[var(--color-border)] p-6 text-center text-sm text-[var(--color-fg-muted)]">
          No active openings right now. Set a job alert and we&rsquo;ll email you when one goes live.
        </div>
      ) : (
        <div className="rounded-md border border-[var(--color-border)] px-4">
          {rows.map((j) => (
            <div
              key={j.id}
              className="flex items-center justify-between gap-4 border-b border-[var(--color-border)] py-3 last:border-b-0"
            >
              <div className="min-w-0">
                <Link
                  href={`/job/${j.canonicalSlug}`}
                  className="truncate text-sm font-medium text-[var(--color-fg)] hover:underline"
                >
                  {j.title}
                </Link>
                <p className="mt-0.5 text-xs text-[var(--color-fg-subtle)]">
                  {j.primaryCityName ?? 'Location not set'} · Posted {fmt(j.postedAt)}
                </p>
              </div>
            </div>
          ))}
          {totalActive > TOP_N && (
            <div className="border-t border-[var(--color-border)] py-3 text-center">
              <span className="text-xs text-[var(--color-fg-muted)]">
                Showing {TOP_N} of {totalActive}.
              </span>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
