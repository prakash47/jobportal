// Compact 5-star visual using Unicode stars. Server-renderable; no JS. Empty
// rating renders an unrated state. Half-stars rounded to nearest 0.5.

const FULL = '★';
const EMPTY = '☆';

export interface RatingStarsProps {
  /** 0–5 inclusive; null = no rating yet */
  rating: number | null;
  /** how many people rated; affects the inline label */
  reviewCount?: number;
  size?: 'sm' | 'md';
}

export function RatingStars({ rating, reviewCount, size = 'sm' }: RatingStarsProps) {
  if (rating === null) {
    return (
      <span
        className={size === 'sm' ? 'text-xs text-[var(--color-fg-subtle)]' : 'text-sm text-[var(--color-fg-subtle)]'}
        aria-label="No reviews yet"
      >
        Not yet rated
      </span>
    );
  }
  const rounded = Math.max(0, Math.min(5, Math.round(rating * 2) / 2));
  const fulls = Math.floor(rounded);
  const half = rounded - fulls === 0.5;
  const stars = FULL.repeat(fulls) + (half ? '½' : '') + EMPTY.repeat(5 - fulls - (half ? 1 : 0));
  const fontSize = size === 'sm' ? 'text-sm' : 'text-base';
  const meta =
    typeof reviewCount === 'number' && reviewCount > 0
      ? ` (${reviewCount.toLocaleString('en-IN')} review${reviewCount === 1 ? '' : 's'})`
      : '';

  return (
    <span
      className={`inline-flex items-baseline gap-1.5 ${fontSize} text-[var(--color-fg)]`}
      aria-label={`Rated ${rounded} out of 5${meta}`}
    >
      <span className="font-medium tabular-nums">{rounded.toFixed(1)}</span>
      <span aria-hidden="true" className="text-[oklch(0.75_0.15_80)]">
        {stars}
      </span>
      {meta && <span className="text-xs text-[var(--color-fg-muted)]">{meta}</span>}
    </span>
  );
}
