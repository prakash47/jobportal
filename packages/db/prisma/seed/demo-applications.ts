// Fake candidates + applications for the stakeholder demo (chip #11).
//
// PR #35 seeded 12 companies + 8 recruiters + 50 jobs but no candidate
// users and no Application rows — so when a stakeholder logs in as a
// demo recruiter and clicks into a job, the applicants list is empty
// and the recruiter funnel doesn't demo. This module fills that gap.
//
// Stable IDs in the 200000+ range for User (candidates) and the natural
// Job_id_seq for Application rows. Like the main demo seed, this is
// idempotent: upsert User by email, upsert Candidate by userId, upsert
// Application by the composite unique (userId, jobId).
//
// Distribution is intentionally lopsided to mirror real-world recruiter
// experience: a few popular roles get many applicants, most roles get
// a handful, some intern roles get juniors-only. Status histogram is
// also realistic: most APPLIED, some IN_REVIEW, fewer SHORTLISTED,
// only a handful INTERVIEWED / OFFERED.

import argon2 from 'argon2';
import type { ApplicationStatus, PrismaClient } from '../../generated/client';

// ============================================================
// Candidates — 20, mix of seniority + skill backgrounds
// ============================================================

interface CandidateTemplate {
  email: string;
  name: string;
  headline: string;
  experienceYears: number;
  currentTitle: string | null;
  expectedSalaryMinLpa: number | null;
  expectedSalaryMaxLpa: number | null;
  preferredCitySlugs: string[];
  skillSlugs: string[];
  noticePeriodDays: number;
}

const CANDIDATES: CandidateTemplate[] = [
  // Senior / Staff engineers (5)
  {
    email: 'arjun.iyer+demo@jobportal.dev',
    name: 'Arjun Iyer',
    headline: 'Staff Engineer — Distributed Systems, 11y',
    experienceYears: 11,
    currentTitle: 'Staff Engineer',
    expectedSalaryMinLpa: 70,
    expectedSalaryMaxLpa: 110,
    preferredCitySlugs: ['bangalore', 'hyderabad'],
    skillSlugs: ['go', 'distributed-systems', 'kubernetes', 'postgresql', 'kafka'],
    noticePeriodDays: 60,
  },
  {
    email: 'kavya.shenoy+demo@jobportal.dev',
    name: 'Kavya Shenoy',
    headline: 'Senior Backend Engineer at a YC startup',
    experienceYears: 6,
    currentTitle: 'Senior Backend Engineer',
    expectedSalaryMinLpa: 35,
    expectedSalaryMaxLpa: 55,
    preferredCitySlugs: ['bangalore'],
    skillSlugs: ['go', 'postgresql', 'redis', 'grpc', 'docker'],
    noticePeriodDays: 30,
  },
  {
    email: 'rahul.bhattacharya+demo@jobportal.dev',
    name: 'Rahul Bhattacharya',
    headline: 'Engineering Manager — Last Mile Logistics',
    experienceYears: 12,
    currentTitle: 'Engineering Manager',
    expectedSalaryMinLpa: 55,
    expectedSalaryMaxLpa: 85,
    preferredCitySlugs: ['gurgaon', 'delhi', 'noida'],
    skillSlugs: ['leadership', 'java', 'distributed-systems', 'team-management'],
    noticePeriodDays: 90,
  },
  {
    email: 'meera.subramanian+demo@jobportal.dev',
    name: 'Meera Subramanian',
    headline: 'Senior ML Engineer — Healthcare Imaging',
    experienceYears: 7,
    currentTitle: 'Senior Machine Learning Engineer',
    expectedSalaryMinLpa: 40,
    expectedSalaryMaxLpa: 65,
    preferredCitySlugs: ['bangalore', 'pune'],
    skillSlugs: ['python', 'pytorch', 'machine-learning', 'computer-vision', 'mlops'],
    noticePeriodDays: 60,
  },
  {
    email: 'siddharth.malhotra+demo@jobportal.dev',
    name: 'Siddharth Malhotra',
    headline: 'Senior Data Engineer — Spark / Airflow / dbt',
    experienceYears: 8,
    currentTitle: 'Senior Data Engineer',
    expectedSalaryMinLpa: 35,
    expectedSalaryMaxLpa: 55,
    preferredCitySlugs: ['hyderabad', 'bangalore'],
    skillSlugs: ['python', 'spark', 'airflow', 'snowflake', 'sql', 'dbt'],
    noticePeriodDays: 60,
  },

  // Mid-level engineers (8)
  {
    email: 'ananya.rao+demo@jobportal.dev',
    name: 'Ananya Rao',
    headline: 'Frontend Engineer — React + Next.js',
    experienceYears: 4,
    currentTitle: 'Senior Frontend Engineer',
    expectedSalaryMinLpa: 24,
    expectedSalaryMaxLpa: 38,
    preferredCitySlugs: ['bangalore', 'pune'],
    skillSlugs: ['typescript', 'react', 'nextjs', 'tailwindcss'],
    noticePeriodDays: 60,
  },
  {
    email: 'vikram.kumar+demo@jobportal.dev',
    name: 'Vikram Kumar',
    headline: 'Mobile Engineer — Android + Kotlin',
    experienceYears: 5,
    currentTitle: 'Android Engineer',
    expectedSalaryMinLpa: 22,
    expectedSalaryMaxLpa: 36,
    preferredCitySlugs: ['delhi', 'bangalore'],
    skillSlugs: ['kotlin', 'android-development', 'sqlite'],
    noticePeriodDays: 30,
  },
  {
    email: 'divya.reddy+demo@jobportal.dev',
    name: 'Divya Reddy',
    headline: 'Full-Stack Engineer — TypeScript + Node + Postgres',
    experienceYears: 4,
    currentTitle: 'Full-Stack Engineer',
    expectedSalaryMinLpa: 22,
    expectedSalaryMaxLpa: 34,
    preferredCitySlugs: ['hyderabad', 'bangalore'],
    skillSlugs: ['typescript', 'nodejs', 'react', 'postgresql'],
    noticePeriodDays: 45,
  },
  {
    email: 'arnav.joshi+demo@jobportal.dev',
    name: 'Arnav Joshi',
    headline: 'DevOps Engineer — AWS / Kubernetes',
    experienceYears: 5,
    currentTitle: 'DevOps Engineer',
    expectedSalaryMinLpa: 26,
    expectedSalaryMaxLpa: 40,
    preferredCitySlugs: ['pune', 'mumbai'],
    skillSlugs: ['aws', 'kubernetes', 'terraform', 'docker', 'linux'],
    noticePeriodDays: 60,
  },
  {
    email: 'sneha.kulkarni+demo@jobportal.dev',
    name: 'Sneha Kulkarni',
    headline: 'Backend Engineer — Java / Spring Boot',
    experienceYears: 4,
    currentTitle: 'Software Engineer II',
    expectedSalaryMinLpa: 20,
    expectedSalaryMaxLpa: 32,
    preferredCitySlugs: ['pune', 'bangalore'],
    skillSlugs: ['java', 'spring-boot', 'postgresql', 'kafka'],
    noticePeriodDays: 60,
  },
  {
    email: 'ravi.menon+demo@jobportal.dev',
    name: 'Ravi Menon',
    headline: 'Analytics Engineer — SQL / dbt / Python',
    experienceYears: 3,
    currentTitle: 'Analytics Engineer',
    expectedSalaryMinLpa: 18,
    expectedSalaryMaxLpa: 28,
    preferredCitySlugs: ['bangalore', 'hyderabad'],
    skillSlugs: ['sql', 'dbt', 'python', 'data-modeling'],
    noticePeriodDays: 30,
  },
  {
    email: 'priyanka.desai+demo@jobportal.dev',
    name: 'Priyanka Desai',
    headline: 'Product Manager — DevTools background',
    experienceYears: 5,
    currentTitle: 'Senior Product Manager',
    expectedSalaryMinLpa: 32,
    expectedSalaryMaxLpa: 48,
    preferredCitySlugs: ['bangalore'],
    skillSlugs: ['product-management', 'analytics', 'user-research'],
    noticePeriodDays: 60,
  },
  {
    email: 'kunal.nair+demo@jobportal.dev',
    name: 'Kunal Nair',
    headline: 'UX Designer — Healthcare + B2B SaaS',
    experienceYears: 6,
    currentTitle: 'Senior Product Designer',
    expectedSalaryMinLpa: 26,
    expectedSalaryMaxLpa: 42,
    preferredCitySlugs: ['bangalore', 'pune'],
    skillSlugs: ['ux-design', 'figma', 'user-research'],
    noticePeriodDays: 45,
  },

  // Junior / fresher (5)
  {
    email: 'tanvi.gupta+demo@jobportal.dev',
    name: 'Tanvi Gupta',
    headline: 'Software Engineer — 1.5 years, Java + Spring',
    experienceYears: 1,
    currentTitle: 'Software Engineer',
    expectedSalaryMinLpa: 10,
    expectedSalaryMaxLpa: 16,
    preferredCitySlugs: ['bangalore', 'delhi'],
    skillSlugs: ['java', 'spring-boot', 'sql'],
    noticePeriodDays: 30,
  },
  {
    email: 'aryan.shah+demo@jobportal.dev',
    name: 'Aryan Shah',
    headline: '2024 graduate — Backend (Go) intern at a startup',
    experienceYears: 0,
    currentTitle: null,
    expectedSalaryMinLpa: 8,
    expectedSalaryMaxLpa: 14,
    preferredCitySlugs: ['bangalore', 'hyderabad', 'pune'],
    skillSlugs: ['go', 'data-structures', 'algorithms'],
    noticePeriodDays: 0,
  },
  {
    email: 'isha.khanna+demo@jobportal.dev',
    name: 'Isha Khanna',
    headline: 'Data Analyst — 2 years, e-commerce',
    experienceYears: 2,
    currentTitle: 'Data Analyst',
    expectedSalaryMinLpa: 9,
    expectedSalaryMaxLpa: 15,
    preferredCitySlugs: ['gurgaon', 'noida', 'delhi'],
    skillSlugs: ['sql', 'python', 'data-analysis'],
    noticePeriodDays: 30,
  },
  {
    email: 'manish.verma+demo@jobportal.dev',
    name: 'Manish Verma',
    headline: '2025 graduate — CS, looking for first role',
    experienceYears: 0,
    currentTitle: null,
    expectedSalaryMinLpa: 6,
    expectedSalaryMaxLpa: 12,
    preferredCitySlugs: ['bangalore', 'pune', 'hyderabad', 'chennai'],
    skillSlugs: ['python', 'data-structures', 'algorithms'],
    noticePeriodDays: 0,
  },
  {
    email: 'pooja.patil+demo@jobportal.dev',
    name: 'Pooja Patil',
    headline: 'Junior Mobile Engineer — Flutter',
    experienceYears: 2,
    currentTitle: 'Mobile Engineer',
    expectedSalaryMinLpa: 12,
    expectedSalaryMaxLpa: 18,
    preferredCitySlugs: ['bangalore', 'pune'],
    skillSlugs: ['flutter', 'dart'],
    noticePeriodDays: 30,
  },

  // Non-tech roles (2)
  {
    email: 'aditya.mishra+demo@jobportal.dev',
    name: 'Aditya Mishra',
    headline: 'Sales Manager — B2B SaaS, education sector',
    experienceYears: 8,
    currentTitle: 'Sales Manager',
    expectedSalaryMinLpa: 18,
    expectedSalaryMaxLpa: 32,
    preferredCitySlugs: ['mumbai', 'pune', 'bangalore'],
    skillSlugs: ['b2b-sales', 'business-development'],
    noticePeriodDays: 60,
  },
  {
    email: 'rohini.banerjee+demo@jobportal.dev',
    name: 'Rohini Banerjee',
    headline: 'Editorial Lead — Vernacular publishing',
    experienceYears: 11,
    currentTitle: 'Senior Editor',
    expectedSalaryMinLpa: 22,
    expectedSalaryMaxLpa: 35,
    preferredCitySlugs: ['mumbai', 'delhi', 'kolkata'],
    skillSlugs: ['editorial', 'journalism', 'leadership'],
    noticePeriodDays: 45,
  },
];

// All demo candidates share one password (override via DEMO_SEED_PASSWORD).
const DEMO_PASSWORD = process.env.DEMO_SEED_PASSWORD ?? 'demo-recruiter-pass-2026!';

// ============================================================
// Application distribution — by job id × candidate-index (deterministic)
// ============================================================

// Status histogram (sums to 100, percentages):
//   APPLIED       55  — fresh apps, most common
//   IN_REVIEW     20  — recruiter has looked
//   SHORTLISTED   10
//   INTERVIEWED    8
//   OFFERED        3
//   HIRED          1
//   REJECTED       2  (recruiter said no)
//   WITHDRAWN      1  (candidate said no)
const STATUS_DISTRIBUTION: ApplicationStatus[] = [
  ...Array<ApplicationStatus>(55).fill('APPLIED'),
  ...Array<ApplicationStatus>(20).fill('IN_REVIEW'),
  ...Array<ApplicationStatus>(10).fill('SHORTLISTED'),
  ...Array<ApplicationStatus>(8).fill('INTERVIEWED'),
  ...Array<ApplicationStatus>(3).fill('OFFERED'),
  ...Array<ApplicationStatus>(1).fill('HIRED'),
  ...Array<ApplicationStatus>(2).fill('REJECTED'),
  ...Array<ApplicationStatus>(1).fill('WITHDRAWN'),
];

// Deterministic application generator: each (jobIndex, candidateIndex)
// pair gets a stable status, applied-days-ago, and a coin-flip on
// "did this candidate apply at all". Coin flips weighted so popular
// roles (lower job index = first-listed) get more apps and intern
// roles get junior-only apps.
function shouldApply(jobIndex: number, candidateIndex: number, isIntern: boolean): boolean {
  const candidate = CANDIDATES[candidateIndex]!;
  const isJunior = candidate.experienceYears <= 2;

  // Interns: juniors only.
  if (isIntern && !isJunior) return false;
  if (isIntern && isJunior) return true;

  // Popular roles (first 8 jobs): 75% chance any candidate applies.
  // Tail jobs: 30% chance.
  // Deterministic via xor of indices so re-runs produce same set.
  const popularity = jobIndex < 8 ? 75 : 30;
  const hash = (jobIndex * 37 + candidateIndex * 53) % 100;
  return hash < popularity;
}

// ============================================================
// Seeder
// ============================================================

export async function seedDemoApplications(prisma: PrismaClient): Promise<void> {
  // --- Reference data ---
  const [cities, skills] = await Promise.all([
    prisma.city.findMany({ select: { id: true, slug: true } }),
    prisma.skill.findMany({ select: { id: true, slug: true } }),
  ]);
  const cityIdBySlug = new Map(cities.map((c) => [c.slug, c.id]));
  const skillIdBySlug = new Map(skills.map((s) => [s.slug, s.id]));

  // --- Demo jobs ---
  const jobs = await prisma.job.findMany({
    where: { id: { gte: 100001, lte: 100050 } },
    select: { id: true, title: true, employmentType: true },
    orderBy: { id: 'asc' },
  });
  if (jobs.length === 0) {
    throw new Error(
      'No demo jobs found (ids 100001-100050). Run `pnpm db:seed:demo` first.',
    );
  }

  // --- Candidates ---
  console.log(`  -> upserting ${CANDIDATES.length} candidates...`);
  const passwordHash = await argon2.hash(DEMO_PASSWORD, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 1,
  });

  // Stable User IDs 200001-200020 so re-seeds don't churn and so apps
  // can be cleared cleanly via `id BETWEEN ...`.
  const userIdByEmail = new Map<string, number>();
  for (const [idx, c] of CANDIDATES.entries()) {
    const userId = 200001 + idx;
    const user = await prisma.user.upsert({
      where: { email: c.email },
      create: {
        id: userId,
        email: c.email,
        passwordHash,
        name: c.name,
        role: 'CANDIDATE',
        emailVerified: true,
      },
      update: { name: c.name, role: 'CANDIDATE', emailVerified: true },
      select: { id: true },
    });
    userIdByEmail.set(c.email, user.id);

    const preferredCityIds: number[] = [];
    for (const slug of c.preferredCitySlugs) {
      const id = cityIdBySlug.get(slug);
      if (id !== undefined) preferredCityIds.push(id);
    }
    const candidateSkillIds: number[] = [];
    for (const slug of c.skillSlugs) {
      const id = skillIdBySlug.get(slug);
      if (id !== undefined) candidateSkillIds.push(id);
      else console.warn(`[seed:demo:apps] unknown skill "${slug}" for candidate ${c.email}`);
    }

    await prisma.candidate.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        headline: c.headline,
        experienceMonths: c.experienceYears * 12,
        currentTitle: c.currentTitle,
        expectedSalaryMinPaise: c.expectedSalaryMinLpa !== null
          ? c.expectedSalaryMinLpa * 10_000_000
          : null,
        expectedSalaryMaxPaise: c.expectedSalaryMaxLpa !== null
          ? c.expectedSalaryMaxLpa * 10_000_000
          : null,
        noticePeriodDays: c.noticePeriodDays,
        preferredCityIds,
        skillIds: candidateSkillIds,
        // Rough completeness — every candidate has headline/skills/cities
        // populated so the percentage is meaningful for the demo
        // dashboard. Real recompute logic ships in the profile module.
        profileCompleteness: 75,
      },
      update: {
        headline: c.headline,
        experienceMonths: c.experienceYears * 12,
        currentTitle: c.currentTitle,
        expectedSalaryMinPaise: c.expectedSalaryMinLpa !== null
          ? c.expectedSalaryMinLpa * 10_000_000
          : null,
        expectedSalaryMaxPaise: c.expectedSalaryMaxLpa !== null
          ? c.expectedSalaryMaxLpa * 10_000_000
          : null,
        noticePeriodDays: c.noticePeriodDays,
        preferredCityIds,
        skillIds: candidateSkillIds,
      },
    });
  }

  // --- Applications ---
  // Wipe + reinsert: keeps re-runs deterministic, lets us tweak the
  // distribution without orphans.
  console.log('  -> resetting existing demo applications...');
  const demoUserIds = [...userIdByEmail.values()];
  await prisma.application.deleteMany({ where: { userId: { in: demoUserIds } } });

  let totalApps = 0;
  const statusCounts: Record<string, number> = {};
  for (const [jobIdx, job] of jobs.entries()) {
    const isIntern = job.employmentType === 'INTERN';
    for (const [candIdx, candidate] of CANDIDATES.entries()) {
      if (!shouldApply(jobIdx, candIdx, isIntern)) continue;
      const userId = userIdByEmail.get(candidate.email)!;

      // Deterministic status pick from the histogram.
      const statusHash = (jobIdx * 91 + candIdx * 37) % STATUS_DISTRIBUTION.length;
      const status = STATUS_DISTRIBUTION[statusHash]!;
      statusCounts[status] = (statusCounts[status] ?? 0) + 1;

      // Applied 1-25 days ago, deterministic per pair.
      const daysAgo = ((jobIdx * 13 + candIdx * 7) % 25) + 1;
      const appliedAt = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);

      await prisma.application.create({
        data: {
          userId,
          jobId: job.id,
          status,
          appliedAt,
          // Light cover letter on a quarter of apps so the recruiter
          // dashboard has something to read.
          coverLetter:
            (jobIdx + candIdx) % 4 === 0
              ? `Hi — I think my work on ${candidate.skillSlugs.slice(0, 2).join(' and ')} fits well with this role. Happy to talk.`
              : null,
        },
      });
      totalApps += 1;
    }
  }

  // --- Advance User_id_seq past demo range ---
  const maxDemoUserId = 200000 + CANDIDATES.length;
  await prisma.$executeRawUnsafe(
    `SELECT setval(pg_get_serial_sequence('"User"', 'id'), $1, true)`,
    maxDemoUserId,
  );

  console.log(
    `[seed:demo:apps] complete — ${CANDIDATES.length} candidates, ${totalApps} applications across ${jobs.length} jobs.`,
  );
  console.log('  status breakdown:');
  for (const [status, count] of Object.entries(statusCounts).sort()) {
    console.log(`    ${status.padEnd(12)} ${count}`);
  }
}
