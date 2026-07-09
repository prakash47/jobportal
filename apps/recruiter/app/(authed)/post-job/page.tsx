import Link from 'next/link';
import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { ACCESS_COOKIE } from '@jobportal/auth';
import { prisma } from '@jobportal/db';
import { isFlagEnabled } from '@jobportal/feature-flags';
import { Button } from '@jobportal/ui';
import { readUserFromCookie } from '../../../lib/auth/server-session';
import { PostJobFlow } from '../../../components/jobs/PostJobFlow';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export const dynamic = 'force-dynamic';

interface QuotaState {
  daily: { count: number; limit: number };
  monthly: { count: number; limit: number };
  unlimited: boolean;
  upgradeAvailable: boolean;
}

async function readQuota(): Promise<QuotaState | null> {
  const jar = await cookies();
  const token = jar.get(ACCESS_COOKIE)?.value;
  if (!token) return null;
  try {
    const res = await fetch(`${API_URL}/recruiter/jobs/quota`, {
      headers: { cookie: `${ACCESS_COOKIE}=${token}` },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as QuotaState;
  } catch {
    return null;
  }
}

// The dedicated "Post a Job" page (moved here from /jobs/new; that path now
// redirects here). Server entry: L2 of killswitch.recruiter_post_job lives at
// the top — if an admin flips it ON the page 404s (the API create() is the L3
// boundary). Then gates on workEmailVerified (hard gate per SRS §4.9.5),
// pre-fetches the catalogues the wizard needs, and derives the L2 quota hint.
export default async function PostJobPage() {
  if (await isFlagEnabled('killswitch.recruiter_post_job')) notFound();

  const session = (await readUserFromCookie())!;
  const recruiter = await prisma.recruiter.findUnique({
    where: { userId: session.sub },
    select: {
      workEmailVerified: true,
      user: { select: { email: true } },
      company: { select: { name: true } },
    },
  });

  if (!recruiter) {
    return (
      <div className="rounded-md border border-dashed border-[var(--color-border)] p-10 text-center text-sm text-[var(--color-fg-muted)]">
        Recruiter profile not found.
      </div>
    );
  }

  if (!recruiter.workEmailVerified) {
    return (
      <div className="space-y-4 rounded-md border border-[var(--color-border)] p-10">
        <h1 className="text-xl font-semibold tracking-tight text-[var(--color-fg)]">
          Verify your email first
        </h1>
        <p className="text-sm text-[var(--color-fg-muted)]">
          We sent a verification link to{' '}
          <span className="font-medium text-[var(--color-fg)]">{recruiter.user.email}</span>.
          Click the link before posting a job — recruiter↔company association needs to be
          confirmed.
        </p>
        <Button asChild variant="secondary">
          <Link href="/dashboard">Back to dashboard</Link>
        </Button>
      </div>
    );
  }

  const [skills, cities, industries, functionalAreas, quota, pastJobsRaw, hotVacancyEnabled, smbEnabled] =
    await Promise.all([
      prisma.skill.findMany({
        select: { id: true, slug: true, name: true },
        orderBy: { name: 'asc' },
        take: 500,
      }),
      prisma.city.findMany({
        select: { id: true, slug: true, name: true },
        orderBy: { name: 'asc' },
      }),
      prisma.industry.findMany({
        select: { id: true, slug: true, name: true },
        orderBy: { name: 'asc' },
      }),
      prisma.functionalArea.findMany({
        select: { id: true, slug: true, name: true },
        orderBy: { name: 'asc' },
      }),
      readQuota(),
      // The recruiter's own past jobs — the "start from a previous job"
      // template list. Lightweight fields only; the full job is fetched on
      // selection via GET /recruiter/jobs/:id.
      prisma.job.findMany({
        where: { postedById: session.sub },
        select: {
          id: true,
          title: true,
          status: true,
          postedAt: true,
          primaryCity: { select: { name: true } },
        },
        orderBy: { postedAt: 'desc' },
        take: 100,
      }),
      // Paid job-type products — gated OFF on Day 0 (CLAUDE.md §0).
      isFlagEnabled('recruiter.hot_vacancy.enabled'),
      isFlagEnabled('recruiter.smb_pack.enabled'),
    ]);

  // Format the posted date server-side with a fixed IST zone (avoids
  // server/client locale drift, matching the seeker dashboard pattern).
  const dateFmt = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const pastJobs = pastJobsRaw.map((j) => ({
    id: j.id,
    title: j.title,
    status: j.status,
    cityName: j.primaryCity?.name ?? null,
    postedLabel: dateFmt.format(j.postedAt),
  }));

  const availability = {
    FREE: true,
    HOT_VACANCY: hotVacancyEnabled,
    SMB: smbEnabled,
    INTERNSHIP: true,
  };

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-fg)]">
            Post a job
          </h1>
          <p className="mt-1 text-sm text-[var(--color-fg-muted)]">
            Posting as <span className="font-medium text-[var(--color-fg)]">{recruiter.company.name}</span>
          </p>
        </div>
        {quota && !quota.unlimited && (
          <p className="text-xs text-[var(--color-fg-muted)] tabular-nums">
            {quota.daily.count}/{quota.daily.limit} today · {quota.monthly.count}/{quota.monthly.limit} this month
          </p>
        )}
      </header>

      <PostJobFlow
        skills={skills}
        cities={cities}
        industries={industries}
        functionalAreas={functionalAreas}
        quota={quota}
        pastJobs={pastJobs}
        availability={availability}
      />
    </div>
  );
}
