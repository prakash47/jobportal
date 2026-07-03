// Shared display formatters for the job-detail page (hero, overview card, and
// the related-roles rail all render the same salary/experience shapes).

// paise → "₹N–M LPA" (or "₹N.N Cr" past a crore). Decimals only when they carry
// information, so ₹32 LPA / ₹12.5 LPA / ₹1.2 Cr.
export function formatSalaryLpa(minPaise: number | null, maxPaise: number | null): string | null {
  if (minPaise === null && maxPaise === null) return null;
  const toLpa = (p: number) => {
    const lakhs = p / 100 / 100_000;
    if (lakhs >= 100) {
      const cr = lakhs / 100;
      return `${Number.isInteger(cr) ? cr : cr.toFixed(1)} Cr`;
    }
    return `${Number.isInteger(lakhs) ? lakhs : lakhs.toFixed(1)}`;
  };
  if (minPaise !== null && maxPaise !== null) return `₹${toLpa(minPaise)}–${toLpa(maxPaise)} LPA`;
  if (minPaise !== null) return `₹${toLpa(minPaise)}+ LPA`;
  return `Up to ₹${toLpa(maxPaise as number)} LPA`;
}

export function formatExperienceYears(min: number | null, max: number | null): string | null {
  if (min === null && max === null) return null;
  if (min !== null && max !== null) return `${min}–${max} yrs`;
  if (min !== null) return `${min}+ yrs`;
  return `Up to ${max} yrs`;
}

// Same "N–M yrs" shape but for the ES JobDoc, which carries experience in
// MONTHS (the detail page reads Prisma years and uses formatExperienceYears).
export function formatExperienceMonths(
  minMonths: number | null,
  maxMonths: number | null,
): string | null {
  const toY = (m: number) => Math.round(m / 12);
  if (minMonths === null && maxMonths === null) return null;
  if (minMonths !== null && maxMonths !== null) return `${toY(minMonths)}–${toY(maxMonths)} yrs`;
  if (minMonths !== null) return `${toY(minMonths)}+ yrs`;
  return `Up to ${toY(maxMonths as number)} yrs`;
}

// Compact relative "posted" age for cards + rails: today, 3d, 2w, 1mo, 1y.
// Epoch math only, so it is timezone-agnostic (no server/client hydration
// drift) and safe to render in a server component.
export function postedAgo(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return '1d ago';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

export const EMPLOYMENT_LABELS: Record<string, string> = {
  FULL_TIME: 'Full-time',
  PART_TIME: 'Part-time',
  CONTRACTOR: 'Contract',
  INTERN: 'Internship',
};

export const WORK_MODE_LABELS: Record<string, string> = {
  ONSITE: 'On-site',
  REMOTE: 'Remote',
  HYBRID: 'Hybrid',
};
