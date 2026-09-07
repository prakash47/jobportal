// Job alerts for the demo candidates.
//
// The alerts page shipped with no seed data at all, so every demo account
// landed on the empty state and none of the row states — Paused, "Last sent
// never", the three cadences — were reachable without creating alerts by hand.
//
// Alerts are derived from each candidate's OWN profile (their `skillIds` and
// `preferredCityIds`, already seeded by demo-applications.ts) rather than
// hardcoded per person, so a saved search reads like something that candidate
// would plausibly have set up, and adding a candidate upstream does not mean
// editing a parallel list down here.
//
// Idempotent, and deliberately narrow: rows are matched on (userId, name) and
// only names this module generates are ever touched. An alert the user created
// themselves is never updated or deleted, because a re-seed must not throw away
// someone's own saved search.

import type { PrismaClient } from '../../generated/client';

/** Mirrors MAX_ALERTS in apps/web/app/alerts/page.tsx. */
const MAX_ALERTS = 10;

/**
 * Headroom below the cap. Seeding right up to MAX_ALERTS would leave the demo
 * account permanently unable to create an alert — the "New alert" button
 * renders disabled at the cap — which is a worse demo than a short list.
 */
const SEED_CEILING = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

interface AlertQuery {
  q?: string;
  skillSlugs?: string[];
  citySlugs?: string[];
  minExperienceMonths?: number;
  maxExperienceMonths?: number;
  salaryMin?: number;
}

interface AlertPlan {
  name: string;
  query: AlertQuery;
  frequency: 'instant' | 'daily' | 'weekly';
  isActive: boolean;
  /** Days ago, or null for "Last sent never". */
  sentDaysAgo: number | null;
}

/**
 * A short role phrase for the alert name, taken from the candidate's headline.
 *
 * Headlines are written as "Senior ML Engineer — Healthcare Imaging" or
 * "2024 graduate — Backend (Go) intern at a startup", so the segment before the
 * em dash is the part that reads like a role. Falls back to the current title,
 * then to a generic phrase, because a fresher has neither.
 */
function rolePhrase(headline: string | null, currentTitle: string | null): string {
  const fromHeadline = headline?.split('—')[0]?.trim();
  if (fromHeadline && fromHeadline.length > 2 && !/^\d{4} graduate$/i.test(fromHeadline)) {
    return fromHeadline;
  }
  return currentTitle?.trim() || 'Software roles';
}

/**
 * A catalogue entry, carrying the display name alongside the slug.
 *
 * Names come from `Skill.name` / `City.name` rather than being derived from the
 * slug. A slug-to-title function has to guess, and it guesses wrong on exactly
 * the entries an engineer would notice: "go" is not "GO", "typescript" is not
 * "Typescript", and "dbt" is not "Dbt" — while "aws" and "sql" genuinely are
 * uppercase. The catalogue already knows all four.
 */
interface Entry {
  slug: string;
  name: string;
}

/**
 * Build the alert set for one candidate.
 *
 * The shapes are deliberately varied rather than three of a kind: the page
 * renders frequency, a Paused badge and a "Last sent" date, and a seed where
 * every row is an active daily alert exercises none of that.
 */
function planFor(input: {
  headline: string | null;
  currentTitle: string | null;
  skills: Entry[];
  cities: Entry[];
  expectedSalaryMinPaise: number | null;
  index: number;
}): AlertPlan[] {
  const { headline, currentTitle, skills, cities, expectedSalaryMinPaise, index } = input;
  const role = rolePhrase(headline, currentTitle);
  const primaryCity = cities[0];
  const secondaryCity = cities[1];
  const topSkills = skills.slice(0, 3);
  const topSlugs = topSkills.map((s) => s.slug);
  const plans: AlertPlan[] = [];

  // 1. The obvious one: my role, where I want to work. Active, daily, recently sent.
  plans.push({
    name: primaryCity ? `${role} in ${primaryCity.name}` : `${role} — anywhere`,
    query: {
      q: role.toLowerCase(),
      ...(primaryCity ? { citySlugs: [primaryCity.slug] } : {}),
      ...(topSlugs.length > 0 ? { skillSlugs: topSlugs } : {}),
    },
    frequency: 'daily',
    isActive: true,
    sentDaysAgo: 1,
  });

  // 2. A skill-only watch, weekly, never sent yet — this is what makes the
  //    "Last sent never" state reachable without creating an alert by hand.
  if (topSkills.length > 0) {
    plans.push({
      name: `${topSkills[0]!.name} roles — any city`,
      query: { skillSlugs: topSlugs.slice(0, 2) },
      frequency: 'weekly',
      isActive: true,
      sentDaysAgo: null,
    });
  }

  // 3. A paused one, so the Paused badge and the Resume affordance both render.
  if (secondaryCity) {
    plans.push({
      name: `Anything in ${secondaryCity.name}`,
      query: {
        citySlugs: [secondaryCity.slug],
        ...(expectedSalaryMinPaise !== null ? { salaryMin: expectedSalaryMinPaise } : {}),
      },
      frequency: 'instant',
      isActive: false,
      sentDaysAgo: 9,
    });
  }

  // 4. A salary-floor watch, instant. Only for candidates who have stated an
  //    expectation — inventing a number for someone who has not is the kind of
  //    fake data that makes a demo lie.
  if (expectedSalaryMinPaise !== null) {
    plans.push({
      name: `${role} above ${Math.round(expectedSalaryMinPaise / 100 / 100_000)} LPA`,
      query: {
        q: role.toLowerCase(),
        salaryMin: expectedSalaryMinPaise,
        ...(cities.length > 0 ? { citySlugs: cities.slice(0, 2).map((c) => c.slug) } : {}),
      },
      frequency: 'instant',
      isActive: true,
      sentDaysAgo: 3,
    });
  }

  // 5. A remote/senior-leaning watch with an experience floor, weekly.
  //    Only on every other candidate, so list lengths vary and the page does
  //    not look generated.
  if (index % 2 === 0 && topSkills.length > 1) {
    plans.push({
      name: `Senior ${topSkills[1]!.name} openings`,
      query: {
        skillSlugs: [topSlugs[1]!],
        minExperienceMonths: 5 * 12,
      },
      frequency: 'weekly',
      isActive: true,
      sentDaysAgo: 5,
    });
  }

  return plans.slice(0, SEED_CEILING);
}

export async function seedDemoAlerts(prisma: PrismaClient): Promise<void> {
  const candidates = await prisma.candidate.findMany({
    where: { user: { email: { endsWith: '+demo@jobportal.dev' } } },
    select: {
      userId: true,
      headline: true,
      currentTitle: true,
      skillIds: true,
      preferredCityIds: true,
      expectedSalaryMinPaise: true,
    },
    orderBy: { userId: 'asc' },
  });

  if (candidates.length === 0) {
    console.log('[seed:demo:alerts] no +demo@jobportal.dev candidates found — run db:seed:demo:apps first.');
    return;
  }

  // Resolve the id arrays to catalogue entries once, rather than per candidate.
  const [skills, cities] = await Promise.all([
    prisma.skill.findMany({ select: { id: true, slug: true, name: true } }),
    prisma.city.findMany({ select: { id: true, slug: true, name: true } }),
  ]);
  const skillById = new Map<number, Entry>(skills.map((s) => [s.id, { slug: s.slug, name: s.name }]));
  const cityById = new Map<number, Entry>(cities.map((c) => [c.id, { slug: c.slug, name: c.name }]));

  // Real job ids for the dedupe state. An alert with a lastSentAt but an empty
  // lastSentJobIds claims "I already emailed you" and "I have emailed you
  // nothing" at the same time, and the worker would re-send the whole matching
  // set on its next run.
  const recentJobs = await prisma.job.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true },
    orderBy: { postedAt: 'desc' },
    take: 25,
  });
  const recentJobIds = recentJobs.map((j) => j.id);

  const now = Date.now();
  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const [index, candidate] of candidates.entries()) {
    const existing = await prisma.jobAlert.findMany({
      where: { userId: candidate.userId },
      select: { id: true, name: true },
    });
    const byName = new Map(existing.map((a) => [a.name, a.id]));

    const plans = planFor({
      headline: candidate.headline,
      currentTitle: candidate.currentTitle,
      skills: candidate.skillIds
        .map((id) => skillById.get(id))
        .filter((s): s is Entry => s !== undefined),
      cities: candidate.preferredCityIds
        .map((id) => cityById.get(id))
        .filter((c): c is Entry => c !== undefined),
      expectedSalaryMinPaise: candidate.expectedSalaryMinPaise,
      index,
    });

    for (const plan of plans) {
      const existingId = byName.get(plan.name);

      // Respect the same cap the UI enforces. Counting existing rows means a
      // candidate who already has ten of their own alerts gains none here
      // rather than being pushed over a limit the product says is a limit.
      if (existingId === undefined && byName.size >= MAX_ALERTS) {
        skipped += 1;
        continue;
      }

      const lastSentAt =
        plan.sentDaysAgo === null ? null : new Date(now - plan.sentDaysAgo * DAY_MS);
      const data = {
        name: plan.name,
        query: plan.query as object,
        frequency: plan.frequency,
        isActive: plan.isActive,
        lastSentAt,
        lastRunAt: lastSentAt,
        lastSentJobIds: lastSentAt === null ? [] : recentJobIds.slice(0, 5),
      };

      if (existingId === undefined) {
        await prisma.jobAlert.create({ data: { ...data, userId: candidate.userId } });
        byName.set(plan.name, -1);
        created += 1;
      } else {
        await prisma.jobAlert.update({ where: { id: existingId }, data });
        updated += 1;
      }
    }
  }

  console.log(
    `[seed:demo:alerts] ${candidates.length} candidates — ${created} created, ${updated} updated, ${skipped} skipped (at cap).`,
  );
}
