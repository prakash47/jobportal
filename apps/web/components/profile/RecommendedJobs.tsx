import Link from 'next/link';
import { searchJobs, type JobDoc } from '@jobportal/search';
import { ArrowRight, Sparkles } from '@jobportal/ui/icons';
import { JobCard } from '../srp';
import { loadSrpUserContext } from '../../lib/srp';

export interface RecommendedJobsProps {
  /** Candidate skill slugs (resolved from skillIds by the caller). */
  skillSlugs: string[];
  /** Candidate preferred-city slugs (resolved from preferredCityIds). */
  citySlugs: string[];
  /** Job ids to drop from results (already applied / current). */
  excludeJobIds: number[];
  limit?: number;
}

// Dashboard "Recommended for you" feed. Mirrors SimilarJobs: matches ACTIVE
// postings by the candidate's skills + preferred cities, newest first, and
// renders the shared JobCard so save/apply state stays consistent with the SRP.
// With no skills/cities it degrades to the most recent ACTIVE jobs. If ES is
// unreachable (common in local dev) it shows a calm prompt rather than
// vanishing, so the dashboard never looks broken.
export async function RecommendedJobs({
  skillSlugs,
  citySlugs,
  excludeJobIds,
  limit = 6,
}: RecommendedJobsProps) {
  let hits: JobDoc[] = [];
  let searchFailed = false;
  try {
    const results = await searchJobs({
      ...(skillSlugs.length > 0 ? { skillSlugs } : {}),
      ...(citySlugs.length > 0 ? { citySlugs } : {}),
      status: 'ACTIVE',
      sort: 'recent',
      // At most `limit` excluded ids can crowd out the visible row, so cap the
      // over-fetch here instead of letting the ES `size` grow unbounded with
      // the candidate's total application count (Search p95 budget, CLAUDE.md §8).
      pageSize: limit + Math.min(excludeJobIds.length, limit) + 4,
    });
    const exclude = new Set(excludeJobIds);
    hits = results.hits.filter((j) => !exclude.has(j.id)).slice(0, limit);
  } catch {
    searchFailed = true;
  }

  const userCtx = await loadSrpUserContext(hits.map((j) => j.id));

  return (
    <section aria-labelledby="recommended-heading" className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h2
          id="recommended-heading"
          className="flex items-center gap-2 text-lg font-semibold text-[var(--color-fg)]"
        >
          <Sparkles className="size-4 text-[var(--color-accent-500)]" aria-hidden="true" />
          Recommended for you
        </h2>
        <Link
          href="/jobs"
          className="inline-flex items-center gap-1 text-sm text-[var(--color-fg-muted)] transition-colors hover:text-[var(--color-fg)]"
        >
          Browse all jobs
          <ArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
      </div>

      {hits.length === 0 ? (
        // Empty / degraded states. The header's "Browse all jobs" link is always
        // present, so these branches avoid repeating it (and only the
        // no-skills case offers an action the header doesn't already cover).
        <div className="rounded-lg border border-dashed border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-8 text-center">
          {searchFailed ? (
            <p className="text-sm text-[var(--color-fg-muted)]">
              Recommendations are temporarily unavailable. Browse all jobs above to keep exploring.
            </p>
          ) : skillSlugs.length === 0 ? (
            <>
              <p className="text-sm text-[var(--color-fg-muted)]">
                Add a few skills to your profile and we&apos;ll surface roles that match.
              </p>
              <Link
                href="/profile/skills"
                className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-[var(--color-primary-600)] hover:underline"
              >
                Add skills
                <ArrowRight className="size-3.5" aria-hidden="true" />
              </Link>
            </>
          ) : (
            <p className="text-sm text-[var(--color-fg-muted)]">
              No new roles match your profile right now. Check back soon.
            </p>
          )}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {hits.map((j) => (
            <JobCard
              key={j.id}
              job={j}
              isAuthed={userCtx.isAuthed}
              initialSaved={userCtx.savedJobIds.has(j.id)}
              returnTo="/profile"
            />
          ))}
        </div>
      )}
    </section>
  );
}
