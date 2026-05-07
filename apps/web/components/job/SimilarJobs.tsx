import { searchJobs, type JobDoc } from '@jobportal/search';
import { JobCard } from '../srp';

export interface SimilarJobsProps {
  jobId: number;
  skillSlugs: string[];
  industrySlug: string | null;
}

// Fetches up to 12 ACTIVE postings sharing skill + industry, excluding the
// current job. SRS §4.2.7: "Similar Jobs (8–12) — by shared skills + industry,
// ranked by recency."
export async function SimilarJobs({ jobId, skillSlugs, industrySlug }: SimilarJobsProps) {
  let hits: JobDoc[] = [];
  try {
    const results = await searchJobs({
      ...(skillSlugs.length > 0 ? { skillSlugs } : {}),
      ...(industrySlug ? { industrySlug } : {}),
      status: 'ACTIVE',
      sort: 'recent',
      pageSize: 12 + 1, // +1 to compensate for self-exclusion
    });
    hits = results.hits.filter((j) => j.id !== jobId).slice(0, 12);
  } catch {
    // ES not reachable in dev → silently render nothing.
    return null;
  }
  if (hits.length === 0) return null;

  return (
    <section aria-label="Similar jobs" className="space-y-4">
      <h2 className="text-lg font-semibold text-[var(--color-fg)]">Similar jobs</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {hits.map((j) => (
          <JobCard key={j.id} job={j} />
        ))}
      </div>
    </section>
  );
}
