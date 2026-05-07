import { prisma } from '@jobportal/db';
import { RatingStars } from './RatingStars';

const TOP_N = 5;

const fmt = (d: Date) =>
  d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

export async function CompanyReviews({ companyId }: { companyId: number }) {
  const reviews = await prisma.companyReview.findMany({
    where: { companyId },
    orderBy: { createdAt: 'desc' },
    take: TOP_N,
    select: {
      id: true,
      rating: true,
      title: true,
      body: true,
      isVerified: true,
      createdAt: true,
      user: { select: { name: true } },
    },
  });

  return (
    <section aria-label="Reviews" className="space-y-4">
      <h2 className="text-lg font-semibold text-[var(--color-fg)]">Reviews</h2>
      {reviews.length === 0 ? (
        <div className="rounded-md border border-dashed border-[var(--color-border)] p-6 text-center text-sm text-[var(--color-fg-muted)]">
          No reviews yet.
        </div>
      ) : (
        <ul className="space-y-3">
          {reviews.map((r) => (
            <li key={r.id} className="space-y-1.5 border-b border-[var(--color-border)] pb-4 last:border-b-0">
              <div className="flex items-baseline justify-between gap-3">
                <RatingStars rating={r.rating} />
                <span className="text-xs text-[var(--color-fg-subtle)]">
                  {r.user?.name ?? 'Anonymous'} · {fmt(r.createdAt)}
                </span>
              </div>
              {r.title && (
                <p className="text-sm font-medium text-[var(--color-fg)]">{r.title}</p>
              )}
              <p className="whitespace-pre-line text-sm text-[var(--color-fg)]">{r.body}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
