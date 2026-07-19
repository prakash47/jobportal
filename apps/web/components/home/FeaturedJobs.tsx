import type { FeaturedJob } from '../../lib/home/queries';
import { SectionHeading } from './SectionHeading';
import { FeaturedJobCard } from './FeaturedJobCard';
import { Reveal } from './Reveal';

interface Props {
  jobs: FeaturedJob[];
}

// "Latest jobs" — the search-first inventory proof, placed immediately after the
// hero. Real ACTIVE jobs from the home query rendered in a flat card grid; the
// first scroll is actionable openings, not a pitch. Guards empty.
export function FeaturedJobs({ jobs }: Props) {
  if (jobs.length === 0) return null;

  return (
    <section className="border-t border-[var(--color-border)]">
      <div className="mx-auto w-full max-w-[var(--container-max)] px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
        <SectionHeading
          eyebrow="Fresh roles"
          title="Latest jobs on Career Queue"
          description="The newest openings from companies hiring across India."
          cta={{ label: 'Browse all jobs', href: '/jobs' }}
        />
        <Reveal>
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {jobs.map((job) => (
              <li key={job.canonicalSlug}>
                <FeaturedJobCard job={job} />
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}
