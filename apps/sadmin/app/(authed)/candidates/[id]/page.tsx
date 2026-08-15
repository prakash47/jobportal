import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Avatar } from '@jobportal/ui';
import { ArrowLeft, ExternalLink } from '@jobportal/ui/icons';
import {
  formatDateIst,
  formatDateTimeIst,
  formatEmploymentType,
  formatSalaryLpa,
  formatWorkMode,
} from '../../../../lib/jobs/format';
import { displayName } from '../../../../lib/employers/format';
import { requireSuperAdmin } from '../../../../lib/auth/require-super-admin';
import {
  CANDIDATE_ACTIVITY_LIMIT,
  CANDIDATE_APPLICATIONS_LIMIT,
  CANDIDATE_SAVED_JOBS_LIMIT,
  CANDIDATE_SESSIONS_LIMIT,
  candidatesHref,
  clampPage,
  firstParam,
  formatApplicationStatus,
  formatBytes,
  formatCurrentSalary,
  formatEducationYears,
  formatExperienceMonths,
  formatGender,
  formatHiddenResumes,
  formatJobStatus,
  formatLanguageProficiency,
  formatLookingFor,
  formatNoticePeriod,
  formatProfileAuditAction,
  formatScanStatus,
  formatSectionCap,
  formatSessionState,
  formatSignInMethod,
  formatWorkStatus,
  hasText,
  initials,
  isOngoingExperience,
  normalizeQuery,
  orDash,
} from '../../../../lib/candidates/format';
import { getCandidateDetail, type CandidateJobRef } from '../../../../lib/candidates/queries';

export const metadata: Metadata = {
  title: 'Candidate profile — Career Queue Super Admin',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

const WEB_URL = process.env.NEXT_PUBLIC_WEB_URL ?? 'http://localhost:3000';

// Raw --color-danger measures under the 4.5:1 AA floor for 14px text on both the
// elevated card and the muted row hover; mixing in 30% of --color-fg darkens it
// on light and lightens it on dark, so it stays theme-aware without touching the
// shared theme.css. Copied verbatim from ../../employers/[id]/page.tsx rather
// than re-derived, so the two consoles colour an exceptional state identically.
const DANGER_TEXT = 'text-[color-mix(in_oklch,var(--color-danger),var(--color-fg)_30%)]';

interface PageProps {
  params: Promise<{ id: string }>;
  // `q` and `page` are the master list's state, carried here by
  // `candidateDetailHref` purely so Back can return to it. Typed as Next
  // actually delivers them — a repeated key arrives as an array — and routed
  // through the same firstParam/normalizeQuery/clampPage codecs the list uses,
  // so the round trip cannot drift. Neither param affects what this page shows.
  searchParams: Promise<{ q?: string | string[]; page?: string | string[] }>;
}

export default async function CandidateProfilePage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const sp = await searchParams;

  // The route is [id], so anything can arrive here.
  //
  // The digits-only test does real work beyond Number.isInteger: Number() also
  // accepts hex and exponent notation, so without it '0x1a' and '1e1' would
  // resolve to real accounts under non-canonical URLs.
  //
  // The upper bound matters more. User.id is a Postgres int4, so an id above
  // 2147483647 does NOT come back as null — it throws out of Prisma ("value is
  // out of range for type integer"). This page reads Prisma directly, and with
  // no segment error.tsx that throw escapes to global-error and answers 500
  // where an unknown id deserves 404. The sibling employers/[id] carries this
  // exact bound after shipping without it.
  //
  // ⚠ This notFound() also depends on there being NO loading.tsx in this segment
  // or its parents: a Suspense boundary flushes the shell first, the response
  // commits 200, and the 404 silently becomes a soft 404. Measured — see the
  // note on the redirect in ../page.tsx.
  const userId = Number(id);
  if (!/^\d+$/.test(id) || !Number.isInteger(userId) || userId < 1) notFound();
  if (userId > 2_147_483_647) notFound();

  // Defence in depth. The (authed) layout already calls this, so on a full page
  // load it runs twice, and that is deliberate.
  //
  // Be precise about why, because the tempting justification is one I could NOT
  // substantiate: an attempt to reach this page's data by replaying an RSC
  // navigation with a hand-built Next-Router-State-Tree (so the layout segment
  // reads as already rendered) did not reproduce any leak — it answered 500 with
  // zero PII, and so did the unguarded sibling /employers/[id], and so did the
  // same request made by a genuine ADMIN. That probe was therefore invalid and
  // proves nothing in either direction. No bypass is known.
  //
  // The reason to keep the call is the standing rule rather than a demonstrated
  // hole: Next renders layouts and pages concurrently and does not re-render an
  // unchanged layout segment on every client-side navigation, which is why
  // Next's own auth guidance puts the check next to the data it protects. The
  // stakes here are unusually high — require-super-admin.ts's header records
  // that the access_token cookie is shared across all four portals (localhost
  // ignores ports; production shares COOKIE_DOMAIN across subdomains), so every
  // signed-in candidate and recruiter arrives at this origin already holding a
  // valid, verifiable token and only the ROLE check turns them away, and this is
  // the most PII-dense route in the product (email, phone, gender, exact salary,
  // CV filenames, full application and session history). The check costs a
  // cookie read plus a JWT verify with no database round trip, and the route is
  // already force-dynamic, so it buys that margin for nothing.
  //
  // The sibling detail routes (employers/[id], jobs/[id]) still rely on the
  // layout alone and should adopt this too. Noted in PROGRESS.md.
  await requireSuperAdmin();

  // One anchor instant for the whole render, so the active-session count and
  // every session state below cannot straddle a boundary and disagree.
  const now = new Date();
  const candidate = await getCandidateDetail(userId, now);
  if (!candidate) notFound();

  const backQuery = normalizeQuery(firstParam(sp.q));
  const backPage = clampPage(firstParam(sp.page));

  const name = displayName(candidate);
  const profile = candidate.profile;

  return (
    <div data-wide className="space-y-6">
      <BackLink page={backPage} q={backQuery} />

      <header className="flex items-start gap-4">
        {/* Decorative: the name beside it carries the information, and Radix
            renders its fallback as a plain <span> with no aria-hidden of its
            own — which on the master list made a screen reader announce every
            row as "P S Priya Sharma". Hidden at the root for the same reason.
            `src` is spread conditionally because exactOptionalPropertyTypes
            rejects an explicit undefined for an optional prop. */}
        <Avatar
          aria-hidden="true"
          size="lg"
          alt=""
          fallback={initials(name)}
          {...(candidate.image ? { src: candidate.image } : {})}
        />
        <div className="min-w-0 space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--color-fg)]">
            {/* Seeker-authored free text, rendered as plain text only. */}
            {name}
          </h1>
          <p className="text-sm text-[var(--color-fg-muted)]">
            Registered {formatDateIst(candidate.registeredAt)} ·{' '}
            {candidate.emailVerified ? 'Email verified' : 'Email not verified'} ·{' '}
            {profile
              ? `Profile ${profile.profileCompleteness}% complete`
              : 'Profile not started'}
          </p>
        </div>
      </header>

      {/* A registered seeker with no Candidate row is an ordinary state, not an
          error: the profile row is provisioned lazily on the first /profile
          read, so email+password signups have none until the person opens their
          profile. Said in words, because six empty cards with no explanation
          read as a broken page. */}
      {!profile && (
        <p
          role="status"
          className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-muted)] px-4 py-3 text-sm text-[var(--color-fg-muted)]"
        >
          This account has registered but has never opened its profile, so there are no profile
          details, CVs or preferences to show. Applications, saved jobs and sign-in activity below
          are still complete.
        </p>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          {/* hasText, not truthiness: the profile DTO permits a whitespace-only
              summary, which would otherwise mount an About card with nothing
              visible inside it. */}
          {profile && hasText(profile.summary) && (
            <Card title="About">
              {/* Seeker-authored. Plain text, never markup. */}
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--color-fg)]">
                {profile.summary}
              </p>
            </Card>
          )}

          {profile && profile.experiences.length > 0 && (
            <Card title="Work experience">
              <ol className="space-y-4">
                {profile.experiences.map((exp) => (
                  <li key={exp.id}>
                    <p className="text-sm font-medium text-[var(--color-fg)]">{exp.title}</p>
                    <p className="text-sm text-[var(--color-fg-muted)]">{exp.companyName}</p>
                    <p className="mt-0.5 text-xs text-[var(--color-fg-muted)]">
                      {formatDateIst(exp.startDate)} –{' '}
                      {isOngoingExperience(exp) ? 'present' : formatDateIst(exp.endDate)}
                    </p>
                    {exp.description && (
                      <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-[var(--color-fg)]">
                        {exp.description}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            </Card>
          )}

          {profile && profile.educations.length > 0 && (
            <Card title="Education">
              <ol className="space-y-4">
                {profile.educations.map((edu) => (
                  <li key={edu.id}>
                    <p className="text-sm font-medium text-[var(--color-fg)]">{edu.degree}</p>
                    <p className="text-sm text-[var(--color-fg-muted)]">{edu.institute}</p>
                    <p className="mt-0.5 text-xs text-[var(--color-fg-muted)]">
                      {/* startYear/endYear are Int columns — YEARS, not dates —
                          so they must not reach a date formatter. */}
                      {formatEducationYears(edu.startYear, edu.endYear)}
                      {edu.fieldOfStudy ? ` · ${edu.fieldOfStudy}` : ''}
                      {edu.grade ? ` · ${edu.grade}` : ''}
                    </p>
                  </li>
                ))}
              </ol>
            </Card>
          )}

          {profile && profile.projects.length > 0 && (
            <Card title="Projects">
              <ol className="space-y-4">
                {profile.projects.map((project) => (
                  <li key={project.id}>
                    <p className="text-sm font-medium text-[var(--color-fg)]">{project.title}</p>
                    {project.description && (
                      <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-[var(--color-fg)]">
                        {project.description}
                      </p>
                    )}
                    {project.techStack.length > 0 && (
                      <ChipList items={project.techStack} className="mt-2" />
                    )}
                    {project.url && (
                      <a
                        href={project.url}
                        target="_blank"
                        // Seeker-supplied URL → nofollow. Own-product links
                        // deliberately do not carry it.
                        rel="noopener noreferrer nofollow"
                        className="mt-1.5 inline-flex items-center gap-1 break-all text-sm text-[var(--color-primary-700)] hover:underline"
                      >
                        {project.url.replace(/^https?:\/\//, '')}
                        <ExternalLink className="size-3.5 shrink-0" aria-hidden="true" />
                        <span className="sr-only">
                          (project link for {project.title}, opens in a new tab)
                        </span>
                      </a>
                    )}
                  </li>
                ))}
              </ol>
            </Card>
          )}

          <Card title="Uploaded CVs">
            {candidate.resumes.length === 0 ? (
              // Keyed on BOTH counts. Testing only the live list produced two
              // contradictory sentences in a row — "has not uploaded a CV"
              // directly above "1 older or removed CV is not shown" — for the
              // ordinary case of a candidate who uploaded one and then removed
              // it, which leaves zero live rows and one hidden one.
              <p className="text-sm text-[var(--color-fg-muted)]">
                {!profile
                  ? 'No CVs — this account has no profile yet.'
                  : candidate.deletedResumeCount > 0
                    ? 'This candidate has no CV on file. Their earlier uploads were replaced or removed.'
                    : 'This candidate has not uploaded a CV.'}
              </p>
            ) : (
              <ul className="space-y-3">
                {candidate.resumes.map((resume) => (
                  <li key={resume.id} className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0">
                      {/* Seeker's own filename. Plain text; wraps rather than
                          overflowing the card. */}
                      <span className="block break-all text-sm text-[var(--color-fg)]">
                        {resume.originalFilename}
                      </span>
                      <span className="mt-0.5 block text-xs text-[var(--color-fg-muted)]">
                        {formatBytes(resume.sizeBytes)} · {formatDateIst(resume.uploadedAt)} ·{' '}
                        <span
                          className={resume.scanStatus === 'INFECTED' ? DANGER_TEXT : undefined}
                        >
                          {formatScanStatus(resume.scanStatus)}
                        </span>
                      </span>
                    </span>
                    {resume.isActive && (
                      <span className="shrink-0 rounded-md bg-[var(--color-bg-muted)] px-2 py-1 text-xs font-medium text-[var(--color-fg)]">
                        Active
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {/* Soft-deleted rows are counted rather than listed, so a filtered
                list can never read as a complete one. Deliberately NOT called
                "deleted": replacing a CV soft-deletes the previous one inside
                the upload transaction, so most of this bucket is superseded
                versions the candidate never deleted. See formatHiddenResumes. */}
            {formatHiddenResumes(candidate.deletedResumeCount) && (
              <p className="mt-3 text-xs text-[var(--color-fg-muted)]">
                {formatHiddenResumes(candidate.deletedResumeCount)}
              </p>
            )}

            {/* The jobs console's precedent: when an action is unavailable, say
                so in words rather than rendering a disabled control. The file
                itself genuinely cannot be served from here — this app has no S3
                client, no alias reaching apps/api's StorageService and no R2
                credentials, so a download would need a new AdminGuard endpoint. */}
            <p className="mt-3 text-xs text-[var(--color-fg-muted)]">
              CV files are not downloadable from this console. Recruiters receive a candidate&rsquo;s
              CV through the application they submitted.
            </p>
          </Card>

          <Card title="Applied jobs">
            {candidate.applications.length === 0 ? (
              <p className="text-sm text-[var(--color-fg-muted)]">
                This candidate has not applied to any jobs yet.
              </p>
            ) : (
              <>
                {/* No tabIndex on this scroller: every row's job title is a link,
                    so the region already has a tab stop and adding one would
                    only create a redundant one. (The sessions table below has no
                    links, which is why it keeps its focusable region.) */}
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[620px] text-left text-sm">
                    <thead className="border-b border-[var(--color-border)] text-xs uppercase tracking-wide text-[var(--color-fg-muted)]">
                      <tr>
                        <th scope="col" className="py-2 pr-4 font-medium">
                          Job
                        </th>
                        <th scope="col" className="py-2 pr-4 font-medium">
                          Applied
                        </th>
                        <th scope="col" className="py-2 pr-4 font-medium">
                          CV sent
                        </th>
                        <th scope="col" className="py-2 font-medium">
                          Status
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--color-border)]">
                      {candidate.applications.map((application) => (
                        <tr key={application.id}>
                          <td className="py-3 pr-4">
                            <JobLink job={application.job} />
                          </td>
                          <td className="py-3 pr-4 text-[var(--color-fg-muted)]">
                            {formatDateIst(application.appliedAt)}
                          </td>
                          <td className="py-3 pr-4 text-[var(--color-fg-muted)]">
                            {/* Application.resumeId is permanently nullable —
                                applications that predate the snapshot column
                                genuinely do not record which CV was sent, so
                                this says that rather than guessing from the
                                candidate's current CV. */}
                            {application.resume ? (
                              <span className="break-all">
                                {application.resume.originalFilename}
                              </span>
                            ) : (
                              'Not recorded'
                            )}
                          </td>
                          <td className="py-3 text-[var(--color-fg)]">
                            {formatApplicationStatus(application.status)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <SectionCap
                  shown={candidate.applications.length}
                  total={candidate.applicationTotal}
                  noun="applications"
                  limit={CANDIDATE_APPLICATIONS_LIMIT}
                />
              </>
            )}
          </Card>

          <Card title="Saved jobs">
            {candidate.savedJobs.length === 0 ? (
              <p className="text-sm text-[var(--color-fg-muted)]">
                This candidate has not saved any jobs.
              </p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] text-left text-sm">
                    <thead className="border-b border-[var(--color-border)] text-xs uppercase tracking-wide text-[var(--color-fg-muted)]">
                      <tr>
                        <th scope="col" className="py-2 pr-4 font-medium">
                          Job
                        </th>
                        <th scope="col" className="py-2 pr-4 font-medium">
                          Saved
                        </th>
                        <th scope="col" className="py-2 font-medium">
                          Job status
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--color-border)]">
                      {/* SavedJob has no id column — its primary key is the
                          composite [userId, jobId] — so the row key is the job. */}
                      {candidate.savedJobs.map((saved) => (
                        <tr key={saved.job.id}>
                          <td className="py-3 pr-4">
                            <JobLink job={saved.job} />
                          </td>
                          <td className="py-3 pr-4 text-[var(--color-fg-muted)]">
                            {formatDateIst(saved.savedAt)}
                          </td>
                          <td className="py-3 text-[var(--color-fg-muted)]">
                            {formatJobStatus(saved.job.status)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <SectionCap
                  shown={candidate.savedJobs.length}
                  total={candidate.savedJobTotal}
                  noun="saved jobs"
                  limit={CANDIDATE_SAVED_JOBS_LIMIT}
                />
              </>
            )}
          </Card>

          <Card title="Sign-in activity">
            {/* This caption is load-bearing, not decoration. There is no
                login-event table in this product: `Session` is the only record,
                and a row is minted on every REFRESH-TOKEN ROTATION as well as on
                a real sign-in (auth.service `refresh()` revokes the old row and
                inserts a new one), so one 30-day sign-in produces many rows.
                `revokedAt` is likewise stamped by both a sign-out and a
                rotation, indistinguishably — which is why the state column says
                "Ended" rather than "Signed out". Presenting this as a login
                history without saying so would be a fabrication. */}
            <p className="text-sm text-[var(--color-fg-muted)]">
              <strong className="font-medium text-[var(--color-fg)]">
                {candidate.activeSessionCount.toLocaleString('en-IN')} active{' '}
                {candidate.activeSessionCount === 1 ? 'session' : 'sessions'}
              </strong>{' '}
              right now. Rows below are sessions, not sign-ins — a new one is created every time an
              access token is refreshed, so a single sign-in produces many. &ldquo;Ended&rdquo;
              covers both signing out and an ordinary token refresh; the two are not recorded
              separately.
            </p>

            {candidate.sessions.length === 0 ? (
              <p className="mt-4 text-sm text-[var(--color-fg-muted)]">
                This candidate has never signed in.
              </p>
            ) : (
              <>
                {/* Every cell here is plain text, so without a tab stop this
                    scroller is unreachable by keyboard once it overflows — and
                    the columns that scroll out are exactly the ones that explain
                    a session. Named region + tabIndex, the TeamTable treatment. */}
                <div
                  role="region"
                  aria-label="Sessions"
                  tabIndex={0}
                  className="mt-4 overflow-x-auto focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-ring)]"
                >
                  <table className="w-full min-w-[520px] text-left text-sm">
                    <thead className="border-b border-[var(--color-border)] text-xs uppercase tracking-wide text-[var(--color-fg-muted)]">
                      <tr>
                        <th scope="col" className="py-2 pr-4 font-medium">
                          Started
                        </th>
                        <th scope="col" className="py-2 pr-4 font-medium">
                          Expires
                        </th>
                        <th scope="col" className="py-2 font-medium">
                          State
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--color-border)]">
                      {candidate.sessions.map((session) => (
                        <tr key={session.id}>
                          <td className="py-3 pr-4 text-[var(--color-fg)]">
                            {formatDateTimeIst(session.createdAt)}
                          </td>
                          <td className="py-3 pr-4 text-[var(--color-fg-muted)]">
                            {formatDateTimeIst(session.expiresAt)}
                          </td>
                          <td className="py-3 text-[var(--color-fg-muted)]">
                            {formatSessionState(session, now)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <SectionCap
                  shown={candidate.sessions.length}
                  total={candidate.sessionTotal}
                  noun="sessions"
                  limit={CANDIDATE_SESSIONS_LIMIT}
                />
              </>
            )}
          </Card>

          <Card title="Profile activity">
            {candidate.activity.length === 0 ? (
              <p className="text-sm text-[var(--color-fg-muted)]">
                No profile changes have been recorded for this candidate.
              </p>
            ) : (
              <>
                <ol className="space-y-3">
                  {candidate.activity.map((entry) => (
                    <li key={entry.id} className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="min-w-0 text-[var(--color-fg)]">
                        {formatProfileAuditAction(entry.action)}
                      </span>
                      <span className="shrink-0 text-xs text-[var(--color-fg-muted)]">
                        {formatDateTimeIst(entry.createdAt)}
                      </span>
                    </li>
                  ))}
                </ol>
                <SectionCap
                  shown={candidate.activity.length}
                  total={candidate.activityTotal}
                  noun="entries"
                  limit={CANDIDATE_ACTIVITY_LIMIT}
                />
              </>
            )}
          </Card>
        </div>

        <aside className="space-y-6">
          <Card title="Account">
            <dl className="space-y-3 text-sm">
              <Row label="Email" value={candidate.email} />
              <Row
                label="Email verified"
                value={candidate.emailVerified ? 'Yes' : 'No'}
                tone={candidate.emailVerified ? undefined : 'danger'}
              />
              {/* User.phone is free-form and unverified for most accounts —
                  shown exactly as written, never reformatted into a shape it
                  may not be. Already visible on the master list. */}
              <Row label="Phone" value={orDash(candidate.phone)} />
              <Row label="Phone verified" value={candidate.phoneVerified ? 'Yes' : 'No'} />
              <Row label="Signed up with" value={formatSignInMethod(candidate)} />
              <Row label="Registered" value={formatDateIst(candidate.registeredAt)} />
              {profile && <Row label="Profile created" value={formatDateIst(profile.createdAt)} />}
              {profile && <Row label="Last updated" value={formatDateIst(profile.updatedAt)} />}
            </dl>
          </Card>

          {profile && (
            <Card title="Profile">
              <dl className="space-y-3 text-sm">
                <Row label="Headline" value={orDash(profile.headline)} />
                <Row label="Current title" value={orDash(profile.currentTitle)} />
                {/* The catalogue-linked company wins over the free-text one, but
                    a whitespace-only free-text value must still fall through to
                    the em dash rather than to a blank cell. */}
                <Row
                  label="Current employer"
                  value={orDash(profile.currentCompany?.name ?? profile.currentCompanyName)}
                />
                <Row label="Industry" value={orDash(profile.industry)} />
                <Row label="Location" value={orDash(profile.currentCityName)} />
                <Row label="Work status" value={formatWorkStatus(profile.workStatus)} />
                <Row label="Looking for" value={formatLookingFor(profile.lookingFor)} />
                <Row
                  label="Experience"
                  value={formatExperienceMonths(profile.experienceMonths)}
                />
                <Row
                  label="Notice period"
                  value={formatNoticePeriod(profile.noticePeriodDays)}
                />
                <Row
                  label="Current salary"
                  value={formatCurrentSalary(profile.currentSalaryPaise)}
                />
                <Row
                  label="Expected salary"
                  value={
                    formatSalaryLpa(
                      profile.expectedSalaryMinPaise,
                      profile.expectedSalaryMaxPaise,
                    ) ?? '—'
                  }
                />
                <Row label="Gender" value={formatGender(profile.gender)} />
                <Row label="Profile views" value={profile.profileViews.toLocaleString('en-IN')} />
              </dl>
            </Card>
          )}

          {profile && (
            <Card title="Preferences & skills">
              <dl className="space-y-3 text-sm">
                <Row
                  label="Work modes"
                  value={
                    profile.preferredWorkModes.length === 0
                      ? '—'
                      : profile.preferredWorkModes.map(formatWorkMode).join(', ')
                  }
                />
                <Row
                  label="Job types"
                  value={
                    profile.preferredJobTypes.length === 0
                      ? '—'
                      : profile.preferredJobTypes.map(formatEmploymentType).join(', ')
                  }
                />
              </dl>

              <SubHeading>Preferred cities</SubHeading>
              {profile.preferredCities.length === 0 ? (
                <p className="text-sm text-[var(--color-fg-muted)]">None chosen.</p>
              ) : (
                <ChipList items={profile.preferredCities} />
              )}

              <SubHeading>Skills</SubHeading>
              {profile.skills.length === 0 ? (
                <p className="text-sm text-[var(--color-fg-muted)]">None added.</p>
              ) : (
                <ChipList items={profile.skills} />
              )}

              <SubHeading>Languages</SubHeading>
              {profile.languages.length === 0 ? (
                <p className="text-sm text-[var(--color-fg-muted)]">None added.</p>
              ) : (
                <dl className="space-y-3 text-sm">
                  {profile.languages.map((language) => (
                    <Row
                      key={language.id}
                      label={language.name}
                      value={formatLanguageProficiency(language.proficiency)}
                    />
                  ))}
                </dl>
              )}
            </Card>
          )}

          <Card title="Applications">
            {/* Every bucket named. A single "applications" total would say
                nothing about where they actually are, and a status the candidate
                has none of is informative rather than noise. */}
            <dl className="space-y-3 text-sm">
              <Row label="All applications" value={fmt(candidate.applicationTotal)} />
              <Row label="Applied" value={fmt(candidate.applicationCounts.APPLIED)} />
              <Row label="In review" value={fmt(candidate.applicationCounts.IN_REVIEW)} />
              <Row label="Shortlisted" value={fmt(candidate.applicationCounts.SHORTLISTED)} />
              <Row label="Interviewed" value={fmt(candidate.applicationCounts.INTERVIEWED)} />
              <Row label="Offered" value={fmt(candidate.applicationCounts.OFFERED)} />
              <Row label="Hired" value={fmt(candidate.applicationCounts.HIRED)} />
              <Row label="Rejected" value={fmt(candidate.applicationCounts.REJECTED)} />
              <Row label="Withdrawn" value={fmt(candidate.applicationCounts.WITHDRAWN)} />
              <Row label="Saved jobs" value={fmt(candidate.savedJobTotal)} />
            </dl>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function fmt(n: number): string {
  return n.toLocaleString('en-IN');
}

/**
 * The job title itself is the link, rather than a trailing "View".
 *
 * That is an accessibility decision, not a layout one: twenty rows each ending
 * in a control named "View job" gives a screen-reader user listing the page's
 * links twenty identical names — exactly the defect the master list's
 * InertAction exists to avoid. Using the title makes every link name unique and
 * meaningful by construction.
 */
function JobLink({ job }: { job: CandidateJobRef }) {
  return (
    <span className="block">
      <a
        href={`${WEB_URL}/job/${job.canonicalSlug}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-baseline gap-1 font-medium text-[var(--color-primary-700)] hover:underline"
      >
        {job.title}
        <ExternalLink className="size-3.5 shrink-0 self-center" aria-hidden="true" />
        <span className="sr-only">(opens the job seeker site in a new tab)</span>
      </a>
      <span className="mt-0.5 block text-xs text-[var(--color-fg-muted)]">
        {job.company.name} · {formatJobStatus(job.status)}
      </span>
    </span>
  );
}

/**
 * "Showing the latest 20 of 137" — rendered only when the section is genuinely
 * truncated, so a complete list is never labelled as if something were hidden.
 */
function SectionCap({
  shown,
  total,
  noun,
  limit,
}: {
  shown: number;
  total: number;
  noun: string;
  limit: number;
}) {
  const text = formatSectionCap(Math.min(shown, limit), total, noun);
  if (!text) return null;
  return <p className="mt-3 text-xs text-[var(--color-fg-muted)]">{text}</p>;
}

function ChipList({ items, className }: { items: string[]; className?: string }) {
  return (
    <ul className={`flex flex-wrap gap-2${className ? ` ${className}` : ''}`}>
      {/* Keyed by position, not by value. These arrays are not sets: neither
          ProjectCreateDto.techStack nor ProfilePatchDto.preferredCityIds
          de-duplicates, so ["React","React"] is storable and a value key would
          collide (a React duplicate-key warning, and two entries sharing one
          slot in the reconciliation map). The list is static and never
          reordered, so the index is a stable identity here. */}
      {items.map((item, i) => (
        <li
          key={i}
          className="rounded-md bg-[var(--color-bg-muted)] px-2 py-1 text-xs text-[var(--color-fg)]"
        >
          {item}
        </li>
      ))}
    </ul>
  );
}

function SubHeading({ children }: { children: React.ReactNode }) {
  // A <p>, not a heading: the page keeps exactly one h1 and one h2 per Card, so
  // a third level here would put an h3 inside a card whose h2 already names it.
  return (
    <p className="mt-4 mb-2 text-xs font-medium uppercase tracking-wide text-[var(--color-fg-muted)]">
      {children}
    </p>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-5">
      <h2 className="text-sm font-semibold text-[var(--color-fg)]">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

// `tone` is declared `| undefined` rather than just optional because tsconfig
// sets exactOptionalPropertyTypes, under which a caller's `tone={cond ? 'danger'
// : undefined}` is not assignable to a bare `tone?: 'danger'`.
function Row({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'danger' | undefined;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-[var(--color-fg-muted)]">{label}</dt>
      <dd
        className={`min-w-0 text-right ${
          tone === 'danger' ? DANGER_TEXT : 'text-[var(--color-fg)]'
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

function BackLink({ page, q }: { page: number; q: string | undefined }) {
  return (
    <Link
      href={candidatesHref(page, q)}
      className="inline-flex items-center gap-1.5 text-sm text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
    >
      <ArrowLeft className="size-4" aria-hidden="true" />
      Back to candidate management
    </Link>
  );
}
