// Verification progress for the recruiter dashboard — the page's lede.
//
// Three independent axes, every one of them read from columns that already
// exist. Nothing here invents a schema field or a stored percentage:
//
//   1. Work email  — `Recruiter.workEmailVerified`. The only axis that gates
//                    anything today (recruiter-jobs.service.ts refuses to post
//                    a job until it is true).
//   2. Company profile — the eight nullable, recruiter-editable columns that
//                    /profile already edits. Presence-only; we never judge the
//                    content.
//   3. Company KYC — `CompanyKyc.status` plus the FIVE submit predicates the
//                    API itself enforces in
//                    apps/api/src/recruiter-kyc/recruiter-kyc.service.ts
//                    (`missing[]`). Mirrored here field-for-field and
//                    word-for-word so the dashboard can never tell a recruiter
//                    they are ready to submit when the API would reject them.
//                    If that list changes, change it here in the same PR.
//
// Pure + side-effect free (no Prisma, no React, no fetch) so it unit-tests
// directly and can be imported from a server component without pulling a client
// bundle. `KycStatusBadge`'s local union is reused rather than importing the
// Prisma enum, for the same reason.

import type { KycBadgeStatus } from '../../components/kyc/KycStatusBadge';

export type VerificationStepState = 'DONE' | 'IN_REVIEW' | 'ACTION_NEEDED' | 'TODO';

export type VerificationStepKey = 'work-email' | 'company-profile' | 'kyc';

export interface VerificationStep {
  key: VerificationStepKey;
  label: string;
  /** One line explaining why this step is worth doing. */
  description: string;
  /**
   * How this step reads in the all-clear summary, as a sentence fragment.
   * The summary is assembled from the steps that actually ran, so a step
   * removed by a killswitch is never claimed as achieved.
   */
  doneSummary: string;
  state: VerificationStepState;
  /** Sub-items satisfied within this step. */
  done: number;
  /** Sub-items this step contains (1, 8 and 5 respectively). */
  total: number;
  /**
   * This step's share of the progress bar, 0-1. Assigned centrally by
   * `withFraction` — never by the individual step builders — so a future branch
   * cannot break the bar/counter invariant by forgetting it.
   */
  fractionComplete: number;
  /** Where the recruiter goes to finish it; null when there is nothing to do. */
  href: string | null;
  ctaLabel: string | null;
  /** What is still missing, or the reviewer's rejection reason. */
  detail: string | null;
}

/** A step before its progress-bar share is assigned. */
type RawStep = Omit<VerificationStep, 'fractionComplete'>;

/**
 * Assigns a step's share of the bar under ONE rule: a step counts in full only
 * when the recruiter's part is genuinely finished (DONE or IN_REVIEW).
 * Otherwise it is capped strictly below its full share, even when every
 * sub-item happens to be satisfied.
 *
 * That cap is the whole point. Two states reach `done === total` while still
 * being unfinished — a KYC that is filled in but never submitted, and one that
 * was submitted and then REJECTED (a rejection writes only the status and
 * reason; it clears no field and deletes no document). Crediting either in full
 * drove the bar to 100% while the headline beside it still read "2 of 3
 * complete", and told screen-reader users "Verification 100% complete" on an
 * account that had just been turned down.
 *
 * Invariant, asserted in the tests: percent === 100 exactly when complete.
 */
function withFraction(step: RawStep): VerificationStep {
  const finished = step.state === 'DONE' || step.state === 'IN_REVIEW';
  const capped = step.total > 0 ? Math.min(step.done, step.total - 1) / step.total : 0;
  return { ...step, fractionComplete: finished ? 1 : capped };
}

export interface VerificationProgress {
  steps: VerificationStep[];
  /** Steps fully finished from the recruiter's side (DONE or IN_REVIEW). */
  stepsDone: number;
  stepsTotal: number;
  /** 0-100. See WEIGHTING below — the inputs are real, the weighting is a choice. */
  percent: number;
  complete: boolean;
}

/** The eight company columns /profile edits, in the order we surface them. */
export interface CompanyProfileFields {
  description: string | null;
  logoUrl: string | null;
  websiteUrl: string | null;
  companyType: string | null;
  industryId: number | null;
  headquartersCityId: number | null;
  employeeCount: string | null;
  foundedYear: number | null;
}

/**
 * KYC state as PRESENCE ONLY. The three identifiers are reduced to booleans at
 * the query boundary so no GSTIN, PAN or legal name ever travels into the
 * dashboard's render tree — the card only ever needs to know whether each was
 * provided, never what it says.
 */
export interface KycFields {
  status: KycBadgeStatus;
  hasLegalName: boolean;
  hasGstNumber: boolean;
  hasAuthorizedPersonName: boolean;
  /** docType values of the company's ACTIVE (deletedAt: null) documents. */
  docTypes: readonly string[];
  rejectionReason: string | null;
}

export interface VerificationInput {
  workEmailVerified: boolean;
  /** Shown so the recruiter knows which inbox to check. */
  email: string;
  company: CompanyProfileFields | null;
  /** Null when no CompanyKyc row exists — identical to NOT_SUBMITTED. */
  kyc: KycFields | null;
  /** killswitch.recruiter_kyc. When true the KYC step is omitted entirely. */
  kycDisabled: boolean;
}

/**
 * Non-null, and for strings non-empty once trimmed. Exported because the query
 * layer applies the identical test when it reduces the KYC identifiers to
 * booleans — the two must agree or the card and the API would disagree about
 * what counts as "provided".
 */
export function filled(value: string | number | null | undefined): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  return true;
}

// Human labels for the eight profile columns, used to tell the recruiter what
// is still blank rather than making them hunt through the form.
const COMPANY_FIELD_LABELS: ReadonlyArray<readonly [keyof CompanyProfileFields, string]> = [
  ['description', 'description'],
  ['logoUrl', 'logo'],
  ['websiteUrl', 'website'],
  ['companyType', 'company type'],
  ['industryId', 'industry'],
  ['headquartersCityId', 'headquarters city'],
  ['employeeCount', 'company size'],
  ['foundedYear', 'founded year'],
];

export const COMPANY_PROFILE_TOTAL = COMPANY_FIELD_LABELS.length;

/** Number of the eight profile columns that carry a value. */
export function companyProfileDone(company: CompanyProfileFields | null): number {
  if (!company) return 0;
  return COMPANY_FIELD_LABELS.reduce((n, [key]) => (filled(company[key]) ? n + 1 : n), 0);
}

/** Human labels of the profile columns still blank. */
export function missingCompanyFields(company: CompanyProfileFields | null): string[] {
  if (!company) return COMPANY_FIELD_LABELS.map(([, label]) => label);
  return COMPANY_FIELD_LABELS.filter(([key]) => !filled(company[key])).map(([, label]) => label);
}

// The five KYC submit predicates, mirroring recruiter-kyc.service.ts exactly —
// same checks, same order, same wording. `panNumber`, `registrationNumber`,
// `authorizedPersonDesignation` and `authorizedPersonIdType` are OPTIONAL to the
// API and so are deliberately not counted here.
export const KYC_TOTAL = 5;

/** Human labels of the KYC requirements not yet satisfied. */
export function missingKycRequirements(kyc: KycFields | null): string[] {
  const docTypes = new Set(kyc?.docTypes ?? []);
  const missing: string[] = [];
  if (!kyc?.hasLegalName) missing.push('legal company name');
  if (!kyc?.hasGstNumber) missing.push('GST number');
  if (!kyc?.hasAuthorizedPersonName) missing.push('authorized person name');
  if (!docTypes.has('BUSINESS_REGISTRATION')) missing.push('business registration document');
  if (!docTypes.has('AUTHORIZED_PERSON_ID')) missing.push('authorized person ID proof');
  return missing;
}

/** Joins a short list readably: "a", "a and b", "a, b and c". */
export function formatList(items: readonly string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0] as string;
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1] as string}`;
}

function workEmailStep(input: VerificationInput): RawStep {
  const done = input.workEmailVerified;
  return {
    key: 'work-email',
    label: 'Verify your work email',
    description: 'Required before you can post a job.',
    doneSummary: 'email confirmed',
    state: done ? 'DONE' : 'TODO',
    done: done ? 1 : 0,
    total: 1,
    // There is no in-app resend endpoint yet (it was scheduled with the admin
    // console and never landed), so this step names the inbox to check rather
    // than linking a route that does not exist.
    href: null,
    ctaLabel: null,
    detail: done ? null : `Open the link we sent to ${input.email}.`,
  };
}

function companyProfileStep(input: VerificationInput): RawStep {
  const done = companyProfileDone(input.company);
  const missing = missingCompanyFields(input.company);
  const isDone = done === COMPANY_PROFILE_TOTAL;
  return {
    key: 'company-profile',
    label: 'Complete your company profile',
    description: 'A full profile helps candidates trust and find your postings.',
    doneSummary: 'company profile complete',
    state: isDone ? 'DONE' : 'TODO',
    done,
    total: COMPANY_PROFILE_TOTAL,
    href: '/profile',
    ctaLabel: isDone ? 'Review profile' : 'Complete profile',
    detail: isDone ? null : `Still missing: ${formatList(missing)}.`,
  };
}

function kycStep(input: VerificationInput): RawStep {
  const status: KycBadgeStatus = input.kyc?.status ?? 'NOT_SUBMITTED';
  const missing = missingKycRequirements(input.kyc);
  const liveDone = KYC_TOTAL - missing.length;

  const base = {
    key: 'kyc' as const,
    label: 'Verify your company',
    // The verified badge renders on the company profile (VerifiedBadge, shown
    // once KYC is VERIFIED). Job postings carry no such badge today, so this
    // deliberately does not promise one.
    description: 'Earn a verified badge on your company profile.',
    doneSummary: 'company verification approved',
    total: KYC_TOTAL,
    href: '/kyc',
  };

  switch (status) {
    case 'VERIFIED':
      return {
        ...base,
        state: 'DONE',
        // Approved by an admin — every requirement was satisfied at submit time.
        done: KYC_TOTAL,
        ctaLabel: 'View verification',
        detail: null,
      };
    case 'PENDING':
      return {
        ...base,
        state: 'IN_REVIEW',
        // submitKyc() cannot succeed unless all five predicates passed, so a
        // PENDING row is proof the recruiter's side is finished — this is a
        // fact about the API's guard, not an assumption.
        done: KYC_TOTAL,
        ctaLabel: 'View submission',
        detail: 'Our team is reviewing your documents.',
      };
    case 'REJECTED':
      return {
        ...base,
        state: 'ACTION_NEEDED',
        done: liveDone,
        // A rejection leaves all five requirements on file — the API cannot
        // reach PENDING without them, and an admin's review writes only the
        // status and reason. So liveDone is normally the full 5, and crediting
        // that as complete would show a 100% bar on an account that was just
        // turned down. Held below full until it is resubmitted and approved.
        ctaLabel: 'Fix and resubmit',
        detail: input.kyc?.rejectionReason?.trim()
          ? input.kyc.rejectionReason
          : 'Your submission needs changes before it can be approved.',
      };
    case 'NOT_SUBMITTED':
    default:
      return {
        ...base,
        state: 'TODO',
        done: liveDone,
        ctaLabel: liveDone > 0 ? 'Continue verification' : 'Start verification',
        detail: missing.length > 0 ? `Still needed: ${formatList(missing)}.` : null,
      };
  }
}

/**
 * Build the dashboard's verification progress.
 *
 * WEIGHTING: every input is a real column, but how the three steps combine into
 * one percentage is a product choice, so it is made explicitly here rather than
 * hidden. Each step contributes an EQUAL share regardless of how many sub-items
 * it holds, with fractional credit inside the step (see `fractionComplete`).
 * The alternative — pooling all 14 atomic checks — would hand the company
 * profile 57% of the bar and let cosmetic fields outweigh actual KYC. The
 * headline the card leads with is the honest integer "N of M complete"; the bar
 * is secondary and must never contradict it: `percent` reaches 100 only when
 * every step is DONE or IN_REVIEW, which is exactly when `complete` is true.
 *
 * When killswitch.recruiter_kyc is ON the KYC step is dropped entirely (M
 * becomes 2), because /kyc would 404 and we must not link a recruiter into a
 * dead route or hold their progress against a feature that is switched off.
 */
export function computeVerificationProgress(input: VerificationInput): VerificationProgress {
  const raw: RawStep[] = [workEmailStep(input), companyProfileStep(input)];
  if (!input.kycDisabled) raw.push(kycStep(input));
  const steps = raw.map(withFraction);

  const stepsDone = steps.filter((s) => s.state === 'DONE' || s.state === 'IN_REVIEW').length;
  const fraction = steps.reduce((sum, s) => sum + s.fractionComplete, 0);
  const percent = steps.length > 0 ? Math.round((100 * fraction) / steps.length) : 0;

  return {
    steps,
    stepsDone,
    stepsTotal: steps.length,
    percent,
    complete: stepsDone === steps.length,
  };
}
