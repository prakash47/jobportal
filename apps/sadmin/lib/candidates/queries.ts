// Candidate Management reads.
//
// Reads/writes split (the repo's topology): this console is display-only, so
// every row comes straight from Postgres via Prisma inside the RSC — no BFF hop
// and no new API endpoint, the same call lib/employers/queries.ts and
// lib/dashboard/queries.ts make and for the same reason.
//
// ⚠ Anything that ever WRITES from this surface must move to apps/api so
// AdminGuard, Zod validation and audit logging all apply. That is not
// hypothetical here: the Actions column already renders View / Suspend / Delete
// as inert controls. Wiring any of them to a Prisma mutation or a server action
// in this file would bypass all three. (Suspend cannot be wired at all yet —
// there is no suspension column on User; see PROGRESS.md for what it needs.)

import { prisma } from '@jobportal/db';
import type {
  ApplicationStatus,
  AuthProvider,
  EmploymentType,
  Gender,
  JobStatus,
  LanguageProficiency,
  LookingFor,
  ProfileAuditAction,
  ResumeScanStatus,
  WorkMode,
  WorkStatus,
} from '@jobportal/db';
import {
  CANDIDATES_PAGE_SIZE,
  CANDIDATE_ACTIVITY_LIMIT,
  CANDIDATE_APPLICATIONS_LIMIT,
  CANDIDATE_SAVED_JOBS_LIMIT,
  CANDIDATE_SESSIONS_LIMIT,
} from './format';

export interface CandidateListRow {
  id: number;
  /** User.name. NOT NULL in the schema, but may be an empty string. */
  name: string;
  email: string;
  /**
   * User.phone. Deliberately NOT normalised or unique in the schema, so this is
   * free-form text — display only, never a key to match rows on.
   */
  phone: string | null;
  /** User.image — an OAuth provider's avatar URL. Null for every other signup. */
  image: string | null;
  headline: string | null;
  currentTitle: string | null;
  /** Candidate.currentCityName — free text, with no link to the City catalogue. */
  location: string | null;
  /**
   * User.createdAt — when the ACCOUNT was created. Deliberately not
   * Candidate.createdAt, which is when the profile row was lazily provisioned:
   * that is a later instant, and it does not exist at all for a seeker who has
   * never opened /profile.
   */
  registeredAt: Date;
}

export interface CandidateListPage {
  rows: CandidateListRow[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * The candidate master list, newest signup first, optionally filtered by name or
 * email.
 *
 * ⚠ This queries `User`, NOT `Candidate`, and that is the single most important
 * decision in this file. The `Candidate` profile row is provisioned LAZILY on
 * the first /profile read — email+password registration creates only the `User`,
 * and the Google signup path swallows a failed `Candidate` create (both
 * documented at lib/dashboard/queries.ts). Driving off `Candidate` would
 * therefore SILENTLY OMIT real registered seekers from a list whose whole job is
 * to be complete, with no error to notice. The dashboard's "Job seekers" KPI
 * counts `user.count({ where: { role: 'CANDIDATE' } })` for the same reason, and
 * an existing test pins it. `candidate` is consequently a nullable relation
 * everywhere below.
 */
export async function listCandidates(page: number, q?: string): Promise<CandidateListPage> {
  // Built ONCE and handed to both queries by reference. The employer list gets
  // away with a bare count() because it has no filter; here a divergence between
  // the two where-clauses would make the total, the count line, the pagination
  // link count and the over-range redirect all disagree with the visible rows.
  //
  // `role` is indexed (@@index([role]) on User). The name/email `contains` arms
  // are not — see the note in the page's PR entry; fine at this scale, worth
  // revisiting with a trigram index long before it matters.
  const where = {
    role: 'CANDIDATE' as const,
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: 'insensitive' as const } },
            { email: { contains: q, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      where,
      // `id` breaks ties deterministically. Offset pagination is only sound if
      // the sort is a total order: two users sharing a createdAt could otherwise
      // be ordered differently between the page-1 and page-2 queries, which
      // drops one row and duplicates another across the seam. createdAt alone is
      // not unique (nothing in the schema makes it so); `id` is. Seeded demo
      // candidates are inserted in a single batch, so equal timestamps are a
      // live possibility here rather than a theoretical one.
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * CANDIDATES_PAGE_SIZE,
      take: CANDIDATES_PAGE_SIZE,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        image: true,
        createdAt: true,
        // Nullable relation — see the warning above.
        candidate: {
          select: { headline: true, currentTitle: true, currentCityName: true },
        },
      },
    }),
    prisma.user.count({ where }),
  ]);

  return {
    rows: users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      phone: u.phone,
      image: u.image,
      headline: u.candidate?.headline ?? null,
      currentTitle: u.candidate?.currentTitle ?? null,
      location: u.candidate?.currentCityName ?? null,
      registeredAt: u.createdAt,
    })),
    total,
    page,
    pageSize: CANDIDATES_PAGE_SIZE,
  };
}

// ---------------------------------------------------------------------------
// Candidate detail (/candidates/[id])
// ---------------------------------------------------------------------------

export interface CandidateEducation {
  id: number;
  institute: string;
  degree: string;
  fieldOfStudy: string | null;
  startYear: number;
  endYear: number | null;
  grade: string | null;
}

export interface CandidateExperience {
  id: number;
  companyName: string;
  title: string;
  startDate: Date;
  endDate: Date | null;
  isCurrent: boolean;
  description: string | null;
}

export interface CandidateProject {
  id: number;
  title: string;
  description: string | null;
  techStack: string[];
  url: string | null;
}

export interface CandidateLanguageRow {
  id: number;
  name: string;
  proficiency: LanguageProficiency;
}

export interface CandidateProfile {
  headline: string | null;
  summary: string | null;
  currentTitle: string | null;
  currentCompanyName: string | null;
  currentCityName: string | null;
  currentCompany: { id: number; name: string; slug: string } | null;
  industry: string | null;
  workStatus: WorkStatus | null;
  lookingFor: LookingFor | null;
  gender: Gender | null;
  experienceMonths: number | null;
  noticePeriodDays: number | null;
  currentSalaryPaise: number | null;
  expectedSalaryMinPaise: number | null;
  expectedSalaryMaxPaise: number | null;
  preferredWorkModes: WorkMode[];
  preferredJobTypes: EmploymentType[];
  /** Resolved names, in the order the seeker stored the ids. */
  skills: string[];
  preferredCities: string[];
  profileCompleteness: number;
  profileViews: number;
  activeResumeId: number | null;
  /** When the profile ROW was provisioned — later than the account's createdAt. */
  createdAt: Date;
  updatedAt: Date;
  educations: CandidateEducation[];
  experiences: CandidateExperience[];
  projects: CandidateProject[];
  languages: CandidateLanguageRow[];
}

export interface CandidateResume {
  id: number;
  originalFilename: string;
  sizeBytes: number;
  mimeType: string;
  scanStatus: ResumeScanStatus;
  uploadedAt: Date;
  /** True when Candidate.activeResumeId points here — the CV that will be sent next. */
  isActive: boolean;
}

export interface CandidateJobRef {
  id: number;
  title: string;
  canonicalSlug: string;
  status: JobStatus;
  company: { id: number; name: string; slug: string };
}

export interface CandidateApplication {
  id: number;
  status: ApplicationStatus;
  appliedAt: Date;
  updatedAt: Date;
  /** The CV actually submitted. Null for rows predating Application.resumeId. */
  resume: { id: number; originalFilename: string } | null;
  job: CandidateJobRef;
}

export interface CandidateSavedJob {
  savedAt: Date;
  job: CandidateJobRef;
}

export interface CandidateSession {
  id: number;
  createdAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
}

export interface CandidateActivityEntry {
  id: number;
  action: ProfileAuditAction;
  createdAt: Date;
}

export interface CandidateDetail {
  /** User.id — this page is keyed by the ACCOUNT, matching the master list. */
  id: number;
  name: string;
  email: string;
  phone: string | null;
  image: string | null;
  emailVerified: boolean;
  phoneVerified: boolean;
  provider: AuthProvider;
  /** Derived from googleId/appleId presence — the raw subject claims never leave the query. */
  hasGoogleLinked: boolean;
  hasAppleLinked: boolean;
  registeredAt: Date;
  /** Null for a registered seeker who has never opened /profile. See listCandidates. */
  profile: CandidateProfile | null;
  resumes: CandidateResume[];
  /** Soft-deleted CVs, counted but not listed — so a filtered list never reads as complete. */
  deletedResumeCount: number;
  applications: CandidateApplication[];
  applicationTotal: number;
  applicationCounts: Record<ApplicationStatus, number>;
  savedJobs: CandidateSavedJob[];
  savedJobTotal: number;
  sessions: CandidateSession[];
  sessionTotal: number;
  activeSessionCount: number;
  activity: CandidateActivityEntry[];
  activityTotal: number;
}

// Every bucket named and pre-zeroed, keyed by the Prisma enum so a new
// ApplicationStatus member is a COMPILE error rather than a tile that silently
// stops being counted. Same construction lib/employers/queries.ts uses for
// JobStatus, and for the same reason: a bare total once folded in DRAFT rows.
const EMPTY_APPLICATION_COUNTS: Record<ApplicationStatus, number> = {
  APPLIED: 0,
  IN_REVIEW: 0,
  SHORTLISTED: 0,
  INTERVIEWED: 0,
  OFFERED: 0,
  HIRED: 0,
  REJECTED: 0,
  WITHDRAWN: 0,
};

/**
 * Everything the candidate detail page renders, in three waves.
 *
 * Returns null when the id is unknown OR belongs to a non-CANDIDATE, and the
 * page turns that into notFound(). `findFirst`, not `findUnique`: `role` is not
 * part of a unique filter, and dropping it would render a recruiter's or an
 * admin's account under a page that describes every field as a job seeker's.
 *
 * `now` is passed in rather than read here so the whole render shares one anchor
 * instant — the active-session count below and every date on the page would
 * otherwise be free to straddle a boundary and disagree.
 *
 * ⚠ Read-only, like everything in this file. See the header: a mutation here
 * would bypass AdminGuard, Zod validation and audit logging.
 */
export async function getCandidateDetail(
  userId: number,
  now: Date,
): Promise<CandidateDetail | null> {
  // Wave 1 — the anchor. Every nested relation carries an explicit `select`
  // rather than being pulled whole: without one, a later column added to
  // Education or Project silently widens this exported type and lands on a staff
  // screen without anyone deciding it should. (The same rule apps/api's `me()`
  // states verbatim.) Two deliberate omissions: `passwordHash` is never selected
  // at all, and `googleId`/`appleId` are selected only to become booleans below.
  const user = await prisma.user.findFirst({
    where: { id: userId, role: 'CANDIDATE' },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      image: true,
      emailVerified: true,
      phoneVerified: true,
      provider: true,
      googleId: true,
      appleId: true,
      createdAt: true,
      candidate: {
        select: {
          // Selected only so the soft-deleted-resume count below can be keyed
          // correctly: Resume hangs off candidateId, not userId. Free here, and
          // cheaper than the separate lookup it replaces.
          id: true,
          headline: true,
          summary: true,
          currentTitle: true,
          currentCompanyName: true,
          currentCityName: true,
          workStatus: true,
          lookingFor: true,
          gender: true,
          experienceMonths: true,
          noticePeriodDays: true,
          currentSalaryPaise: true,
          expectedSalaryMinPaise: true,
          expectedSalaryMaxPaise: true,
          preferredWorkModes: true,
          preferredJobTypes: true,
          skillIds: true,
          preferredCityIds: true,
          profileCompleteness: true,
          profileViews: true,
          activeResumeId: true,
          createdAt: true,
          updatedAt: true,
          industry: { select: { name: true } },
          currentCompany: { select: { id: true, name: true, slug: true } },
          educations: {
            orderBy: [{ startYear: 'desc' }, { id: 'desc' }],
            select: {
              id: true,
              institute: true,
              degree: true,
              fieldOfStudy: true,
              startYear: true,
              endYear: true,
              grade: true,
            },
          },
          experiences: {
            orderBy: [{ isCurrent: 'desc' }, { startDate: 'desc' }, { id: 'desc' }],
            select: {
              id: true,
              companyName: true,
              title: true,
              startDate: true,
              endDate: true,
              isCurrent: true,
              description: true,
            },
          },
          projects: {
            orderBy: { id: 'desc' },
            select: { id: true, title: true, description: true, techStack: true, url: true },
          },
          languages: {
            orderBy: { name: 'asc' },
            select: { id: true, name: true, proficiency: true },
          },
          // Soft-deleted CVs are excluded here rather than in the JSX, so the
          // page cannot accidentally render one. `scanStatus` is NOT filtered:
          // PENDING is the column default and an INFECTED row is precisely what
          // a staff console should surface rather than hide, so every live row
          // is listed with its scan state labelled. (In practice the upload path
          // writes CLEAN directly — ClamAV is not wired — so INFECTED cannot
          // arise today; the filter is left off so it would show up if it ever
          // could.) r2Key is deliberately absent: it is an object key, not a
          // display value, and this app cannot presign it anyway.
          resumes: {
            where: { deletedAt: null },
            orderBy: [{ uploadedAt: 'desc' }, { id: 'desc' }],
            select: {
              id: true,
              originalFilename: true,
              sizeBytes: true,
              mimeType: true,
              scanStatus: true,
              uploadedAt: true,
            },
          },
        },
      },
    },
  });

  if (!user) return null;

  const candidateId = user.candidate?.id ?? null;

  // Wave 2 — everything keyed off User.id, all independent of each other.
  //
  // Note on indexes: Application carries @@index([userId, status]) but nothing
  // on (userId, appliedAt), so the sort below is not index-covered. Fine at this
  // scale and called out here for the same reason listCandidates names its
  // unindexed `contains` arms — so the next person sees it rather than
  // rediscovering it under load.
  const [
    applications,
    applicationTotal,
    applicationGroups,
    savedJobs,
    savedJobTotal,
    sessions,
    sessionTotal,
    activeSessionCount,
    activity,
    activityTotal,
    deletedResumeCount,
  ] = await Promise.all([
    prisma.application.findMany({
      where: { userId: user.id },
      orderBy: [{ appliedAt: 'desc' }, { id: 'desc' }],
      take: CANDIDATE_APPLICATIONS_LIMIT,
      // coverLetter and recruiterNotes are deliberately not selected —
      // recruiter-private, and nothing on this page renders them.
      select: {
        id: true,
        status: true,
        appliedAt: true,
        updatedAt: true,
        resume: { select: { id: true, originalFilename: true } },
        job: {
          select: {
            id: true,
            title: true,
            canonicalSlug: true,
            status: true,
            company: { select: { id: true, name: true, slug: true } },
          },
        },
      },
    }),
    prisma.application.count({ where: { userId: user.id } }),
    // One grouped query, never one count per status.
    prisma.application.groupBy({
      by: ['status'],
      where: { userId: user.id },
      _count: { _all: true },
    }),
    prisma.savedJob.findMany({
      where: { userId: user.id },
      orderBy: [{ savedAt: 'desc' }, { jobId: 'desc' }],
      take: CANDIDATE_SAVED_JOBS_LIMIT,
      select: {
        savedAt: true,
        job: {
          select: {
            id: true,
            title: true,
            canonicalSlug: true,
            status: true,
            company: { select: { id: true, name: true, slug: true } },
          },
        },
      },
    }),
    prisma.savedJob.count({ where: { userId: user.id } }),
    // ipAddress and deviceInfo are deliberately NOT selected — cut from the
    // query rather than hidden in the markup, the same treatment employers/[id]
    // gives GSTIN and PAN. They are the heaviest DPDP exposure available on this
    // page (a raw IP plus an unparsed User-Agent fingerprint) and nothing a
    // super admin does with this screen needs them. refreshTokenHash likewise
    // never appears. lastUsedAt is omitted for a different reason: it is a dead
    // column, never written by any code path, so it always equals createdAt and
    // rendering it as "Last active" would be a fabrication.
    prisma.session.findMany({
      where: { userId: user.id },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: CANDIDATE_SESSIONS_LIMIT,
      select: { id: true, createdAt: true, expiresAt: true, revokedAt: true },
    }),
    prisma.session.count({ where: { userId: user.id } }),
    // The SAME predicate apps/api's `me()` uses for "your active sessions", so
    // the two surfaces cannot disagree about whether a session is live.
    prisma.session.count({
      where: { userId: user.id, revokedAt: null, expiresAt: { gt: now } },
    }),
    prisma.profileAuditLog.findMany({
      where: { userId: user.id },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: CANDIDATE_ACTIVITY_LIMIT,
      // `diff` is deliberately not selected. It is a free-form Json blob whose
      // contents vary per action and can carry field-level values; the action
      // and its timestamp are what this card is for.
      select: { id: true, action: true, createdAt: true },
    }),
    prisma.profileAuditLog.count({ where: { userId: user.id } }),
    candidateId === null
      ? Promise.resolve(0)
      : prisma.resume.count({ where: { candidateId, deletedAt: { not: null } } }),
  ]);

  // Wave 3 — resolve the two UNBACKED scalar id arrays. `skillIds` and
  // `preferredCityIds` are plain Int[] columns with no foreign key and no join
  // table, so a deleted Skill or City leaves a dangling id behind with nothing
  // to enforce otherwise. Two `in` queries, never one per id, and each skipped
  // entirely when its array is empty (`in: []` is a wasted round trip).
  const skillIds = user.candidate?.skillIds ?? [];
  const cityIds = user.candidate?.preferredCityIds ?? [];
  const [skillRows, cityRows] = await Promise.all([
    skillIds.length === 0
      ? Promise.resolve([])
      : prisma.skill.findMany({ where: { id: { in: skillIds } }, select: { id: true, name: true } }),
    cityIds.length === 0
      ? Promise.resolve([])
      : prisma.city.findMany({
          where: { id: { in: cityIds } },
          select: { id: true, name: true, state: true },
        }),
  ]);

  // Preserve the seeker's stored order, and drop ids that no longer resolve
  // rather than rendering a placeholder for a row that no longer exists.
  const skillById = new Map(skillRows.map((s) => [s.id, s.name]));
  const cityById = new Map(cityRows.map((c) => [c.id, `${c.name}, ${c.state}`]));

  const applicationCounts = { ...EMPTY_APPLICATION_COUNTS };
  for (const group of applicationGroups) {
    applicationCounts[group.status] = group._count._all;
  }

  const c = user.candidate;

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    image: user.image,
    emailVerified: user.emailVerified,
    phoneVerified: user.phoneVerified,
    provider: user.provider,
    // Presence only. An account can carry BOTH — someone who signed up with
    // Google on the web and later used Apple on their phone lands on the same
    // row — which `provider` alone does not reveal.
    hasGoogleLinked: user.googleId !== null,
    hasAppleLinked: user.appleId !== null,
    registeredAt: user.createdAt,
    profile: c
      ? {
          headline: c.headline,
          summary: c.summary,
          currentTitle: c.currentTitle,
          currentCompanyName: c.currentCompanyName,
          currentCityName: c.currentCityName,
          currentCompany: c.currentCompany,
          industry: c.industry?.name ?? null,
          workStatus: c.workStatus,
          lookingFor: c.lookingFor,
          gender: c.gender,
          experienceMonths: c.experienceMonths,
          noticePeriodDays: c.noticePeriodDays,
          currentSalaryPaise: c.currentSalaryPaise,
          expectedSalaryMinPaise: c.expectedSalaryMinPaise,
          expectedSalaryMaxPaise: c.expectedSalaryMaxPaise,
          preferredWorkModes: c.preferredWorkModes,
          preferredJobTypes: c.preferredJobTypes,
          skills: skillIds.map((id) => skillById.get(id)).filter((n): n is string => n != null),
          preferredCities: cityIds
            .map((id) => cityById.get(id))
            .filter((n): n is string => n != null),
          profileCompleteness: c.profileCompleteness,
          profileViews: c.profileViews,
          activeResumeId: c.activeResumeId,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
          educations: c.educations,
          experiences: c.experiences,
          projects: c.projects,
          languages: c.languages,
        }
      : null,
    resumes: (c?.resumes ?? []).map((r) => ({
      ...r,
      // Compared in the mapper rather than re-queried: activeResumeId is already
      // on the row above.
      isActive: r.id === c?.activeResumeId,
    })),
    deletedResumeCount,
    applications,
    applicationTotal,
    applicationCounts,
    savedJobs,
    savedJobTotal,
    sessions,
    sessionTotal,
    activeSessionCount,
    activity,
    activityTotal,
  };
}
