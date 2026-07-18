import { prisma } from '@jobportal/db';
import { RatingStars } from './RatingStars';

const TOP_N = 5;

const fmt = (d: Date) =>
  d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

export interface CompanyReviewsProps {
  companyId: number;
  /** Denormalised aggregates from the Company row — power the summary header. */
  averageRating: number | null;
  reviewCount: number;
}

export async function CompanyReviews({ companyId, averageRating, reviewCount }: CompanyReviewsProps) {
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
    <section
      id="reviews"
      aria-label="Reviews"
      className="scroll-mt-24 space-y-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-lg font-semibold text-[var(--color-fg)]">Reviews</h2>
        {reviewCount > 0 && (
          <RatingStars rating={averageRating} reviewCount={reviewCount} size="md" />
        )}
      </div>

      {reviews.length === 0 ? (
        <div className="rounded-md border border-dashed border-[var(--color-border)] p-6 text-center text-sm text-[var(--color-fg-muted)]">
          No reviews yet.
        </div>
      ) : (
        <ul className="space-y-3">
          {reviews.map((r) => (
            <li
              key={r.id}
              className="space-y-1.5 border-b border-[var(--color-border)] pb-4 last:border-b-0 last:pb-0"
            >
              <div className="flex items-baseline justify-between gap-3">
                <RatingStars rating={r.rating} />
                <span className="text-xs text-[var(--color-fg-muted)]">
                  {r.user?.name ?? 'Anonymous'} · {fmt(r.createdAt)}
                </span>
              </div>
              {r.title && <p className="text-sm font-medium text-[var(--color-fg)]">{r.title}</p>}
              <p className="whitespace-pre-line text-sm text-[var(--color-fg)]">{r.body}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
