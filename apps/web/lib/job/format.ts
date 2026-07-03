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
