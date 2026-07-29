// Pure logic for the OTP Sessions console — the state of a single challenge, the
// pivot from two per-channel rows into one row per signup attempt, mobile
// grouping for readability, and URL building. No JSX, no Prisma, no
// `new Date()`: anything that needs "now" takes it as an argument, so the page
// passes one shared anchor instant and the tests are deterministic. Same
// discipline as lib/employers/format.ts and lib/jobs/format.ts.
//
// ⚠ This module is imported by a CLIENT component (RevealCodeButton needs
// formatTimeIst), so it must stay free of RUNTIME imports from @jobportal/db.
// The OtpChannel import below is `import type` and tsconfig.base.json's
// `verbatimModuleSyntax` erases it outright; turning it into a value import
// would drag the Prisma client into the browser bundle.

import type { OtpChannel } from '@jobportal/db';

/** Signup attempts per page. Matches the job review queue and the employer list. */
export const OTP_SESSIONS_PAGE_SIZE = 20;

// Page clamping and last-page arithmetic are not employer-specific — they are
// the offset-pagination rules every table in this portal obeys, and they are
// already unit-tested in ../employers/format.test.ts. Re-exported rather than
// copied: the job review queue keeps a private third copy, and two clamps that
// disagree is a silently wrong ?page on one table and not the other.
export { clampPage, lastPageFor } from '../employers/format';

/**
 * One OtpChallenge row, as this console needs it. Declared structurally rather
 * than as a Prisma payload type so the unit tests can build one without a
 * generated client — the same call lib/employers/format.ts makes.
 *
 * `code` is deliberately ABSENT, and its absence is load-bearing rather than
 * tidiness. The list is rendered by a server component, so every field selected
 * here is serialised into the RSC payload that ships alongside the HTML.
 * Carrying the plaintext code would put every in-flight code on the wire the
 * moment an admin opens the page, whether or not they ever reveal one. Codes are
 * fetched one at a time, on demand, through the audited reveal endpoint instead.
 */
export interface OtpSessionChallenge {
  id: number;
  signupId: string;
  channel: OtpChannel;
  /** The email address or phone number exactly as typed — never normalised. */
  destination: string;
  /** The registrant's typed name, captured before any User row exists. */
  name: string;
  expiresAt: Date;
  /** When the correct code was entered. Null means still unproven. */
  verifiedAt: Date | null;
  /** When a code was last GENERATED for this row — not when it was last touched. */
  lastSentAt: Date;
}

/** A signup attempt's position in the paged list, before its rows are attached. */
export interface SignupPageEntry {
  signupId: string;
  /** max(lastSentAt) across the attempt's channels — what the list is ordered by. */
  lastGeneratedAt: Date;
}

/** One signup attempt: the two channel rows pivoted into a single table row. */
export interface OtpSessionRow {
  signupId: string;
  /** Null when the name is blank on every row — rendered as the em-dash. */
  name: string | null;
  email: OtpSessionChallenge | null;
  phone: OtpSessionChallenge | null;
  lastGeneratedAt: Date;
}

/**
 * What an admin can do with one channel's code, right now.
 *
 * ABSENT is a real state, not a missing value: a registrant who has asked for an
 * email code but not yet a mobile one has exactly one row, and the empty cell
 * means "never requested", not "we lost it".
 */
export type OtpCodeState = 'ABSENT' | 'LIVE' | 'VERIFIED' | 'EXPIRED';

/**
 * VERIFIED wins over EXPIRED deliberately. Once the registrant has entered the
 * correct code there is nothing left for staff to relay on that channel, so
 * "Verified" is the answer to the question this column asks — whether the
 * signup as a whole can still complete is a separate fact the register endpoint
 * decides, and this page does not claim to answer it.
 */
export function deriveChallengeState(
  challenge: Pick<OtpSessionChallenge, 'expiresAt' | 'verifiedAt'> | null,
  now: Date,
): OtpCodeState {
  if (challenge === null) return 'ABSENT';
  if (challenge.verifiedAt !== null) return 'VERIFIED';
  // The boundary itself counts as expired: a code with zero milliseconds left is
  // not worth reading down a phone line. (The API's verify is marginally more
  // generous, rejecting only once the expiry has actually passed, so this errs
  // in the one direction that cannot strand a caller with a dead code.)
  return challenge.expiresAt.getTime() <= now.getTime() ? 'EXPIRED' : 'LIVE';
}

/**
 * The registrant's name, taken from whichever of the attempt's rows was written
 * most recently. Both rows carry a snapshot of what was typed at the time, so
 * they can legitimately disagree — someone who fixes a typo in their name before
 * requesting the second code leaves the older spelling behind on the first row.
 * The newest is what they meant.
 *
 * Returns null when every row's name is blank, which the caller renders as the
 * em-dash rather than an empty cell.
 */
export function resolveSignupName(challenges: readonly OtpSessionChallenge[]): string | null {
  let best: OtpSessionChallenge | null = null;
  for (const c of challenges) {
    if (c.name.trim().length === 0) continue;
    // `id` breaks an exact-millisecond tie so the same data always renders the
    // same name, rather than whichever row the database happened to return first.
    if (best === null || isNewer(c, best)) best = c;
  }
  return best === null ? null : best.name.trim();
}

function isNewer(a: OtpSessionChallenge, b: OtpSessionChallenge): boolean {
  const delta = a.lastSentAt.getTime() - b.lastSentAt.getTime();
  return delta !== 0 ? delta > 0 : a.id > b.id;
}

/**
 * Turns the flat challenge rows into one row per signup attempt, in the order
 * the paging query established. Order comes from `order` rather than from the
 * challenge rows because the ordering key — max(lastSentAt) across an attempt —
 * only exists on the grouped query, and re-deriving it here could disagree with
 * the LIMIT/OFFSET that chose the page.
 *
 * An entry with no rows left is DROPPED rather than rendered blank. That is not
 * defensive: registering spends a verified pair by deleting both rows, and the
 * hourly purge deletes long-expired ones, so an attempt really can vanish
 * between the paging query and the fetch — and a row with neither a code nor a
 * destination tells an admin nothing.
 */
export function pivotSignupRows(
  order: readonly SignupPageEntry[],
  challenges: readonly OtpSessionChallenge[],
): OtpSessionRow[] {
  const bySignup = new Map<string, OtpSessionChallenge[]>();
  for (const c of challenges) {
    const group = bySignup.get(c.signupId);
    if (group) group.push(c);
    else bySignup.set(c.signupId, [c]);
  }

  const rows: OtpSessionRow[] = [];
  for (const entry of order) {
    const group = bySignup.get(entry.signupId);
    if (group === undefined || group.length === 0) continue;
    rows.push({
      signupId: entry.signupId,
      name: resolveSignupName(group),
      email: group.find((c) => c.channel === 'EMAIL') ?? null,
      phone: group.find((c) => c.channel === 'PHONE') ?? null,
      lastGeneratedAt: entry.lastGeneratedAt,
    });
  }
  return rows;
}

/**
 * An Indian mobile number, grouped so it can be read aloud or dialled without
 * losing your place. Presentation only — no digit is added, removed or
 * reordered, because `OtpChallenge.destination` stores the number exactly as the
 * registrant typed it and the schema is explicit that phones are never
 * normalised.
 *
 * Staff read these off the screen mid-call, and an unbroken "+919876543210" is a
 * misdial waiting to happen; "+91 98765 43210" is the grouping Indian carriers
 * and banks already use, so it matches what the person on the other end expects
 * to hear.
 *
 * Anything whose shape is not recognised comes back trimmed but otherwise
 * untouched. An international number, or a typo, must be shown as it really is
 * rather than reshaped into something that looks Indian and is not.
 */
export function formatIndianMobile(raw: string): string {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, '');
  // A leading '+' is preserved, never invented: "919876543210" and
  // "+919876543210" are the same number, but only one of them was typed, and
  // this column is also how an admin checks what the registrant actually entered.
  const hasPlus = trimmed.startsWith('+');

  if (digits.length === 12 && digits.startsWith('91')) {
    return `${hasPlus ? '+' : ''}91 ${groupLocal(digits.slice(2))}`;
  }
  // The bare and trunk-prefixed forms are only recognised WITHOUT a '+': a '+'
  // followed by ten digits is not a valid Indian number in any dialling plan, so
  // grouping it would dress up a typo as a real number.
  if (!hasPlus && digits.length === 10) return groupLocal(digits);
  if (!hasPlus && digits.length === 11 && digits.startsWith('0')) {
    return `0 ${groupLocal(digits.slice(1))}`;
  }
  return trimmed;
}

/** 5 + 5, the standard split for a ten-digit Indian mobile number. */
function groupLocal(local: string): string {
  return `${local.slice(0, 5)} ${local.slice(5)}`;
}

const IST = 'Asia/Kolkata';

/**
 * Clock time in IST, e.g. "3:47 pm".
 *
 * Deliberately NOT lib/jobs/format.ts's formatDateTimeIst, which is what this
 * page uses everywhere a full timestamp belongs ("Last generated", the read-at
 * line). This one exists for the single place a date would be noise: an expiry
 * on a code that is live, and a live code is at most fifteen minutes old, so
 * naming the day cannot disambiguate anything it does not already say.
 *
 * It must be an ABSOLUTE time and never a countdown. The page is server-rendered
 * and does not refresh itself, so a relative "expires in 12 minutes" left on a
 * forgotten tab keeps counting down from a moment that has long passed — the
 * exact failure this surface must not have.
 */
export function formatTimeIst(value: string | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(d.getTime())) return '—';
  return d.toLocaleTimeString('en-IN', { timeZone: IST, hour: 'numeric', minute: '2-digit' });
}

/**
 * Shared by the pagination links and the over-range redirect, so the two can
 * never build different URLs for the same page. Omits the default (page=1) to
 * keep the URL clean. basePath-relative: Next adds '/sadmin' itself.
 */
export function otpSessionsHref(page: number): string {
  return page > 1 ? `/otp-sessions?page=${page}` : '/otp-sessions';
}
