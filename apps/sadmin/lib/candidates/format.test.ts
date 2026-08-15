import { describe, expect, it } from 'vitest';
import {
  CANDIDATE_APPLICATIONS_LIMIT,
  candidateDetailHref,
  candidatesHref,
  clampPage,
  firstParam,
  formatApplicationStatus,
  formatBytes,
  formatCurrentSalary,
  formatEducationYears,
  formatExperienceMonths,
  formatGender,
  formatHeadline,
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
  lastPageFor,
  normalizeQuery,
  orDash,
} from './format';

// Regression: `?q=a&q=b` used to reach `raw.trim()` on an ARRAY and throw
// `TypeError: raw.trim is not a function`, 500-ing the whole route. Reproduced
// in the dev server before the guard existed.
describe('firstParam', () => {
  it('passes a plain string through', () => {
    expect(firstParam('arjun')).toBe('arjun');
  });

  it('passes undefined through', () => {
    expect(firstParam(undefined)).toBeUndefined();
  });

  it('takes the FIRST value of a repeated param', () => {
    expect(firstParam(['arjun', 'priya'])).toBe('arjun');
  });

  // noUncheckedIndexedAccess makes `raw[0]` possibly-undefined, and an empty
  // array is what `?q=` can degrade to; it must not become the string "".
  it('returns undefined for an empty array', () => {
    expect(firstParam([])).toBeUndefined();
  });

  it('composes with normalizeQuery instead of throwing', () => {
    expect(() => normalizeQuery(firstParam(['  arjun  ', 'priya']))).not.toThrow();
    expect(normalizeQuery(firstParam(['  arjun  ', 'priya']))).toBe('arjun');
  });

  // The page routes ?page through here too, so the same repeated key cannot
  // reach clampPage as an array.
  it('composes with clampPage', () => {
    expect(clampPage(firstParam(['3', '9']))).toBe(3);
    expect(clampPage(firstParam([]))).toBe(1);
  });
});

describe('normalizeQuery', () => {
  // `?q=` and a missing `q` must fold to the SAME state, or the where-clause
  // branch, the empty-state copy and the href builder each have to remember to
  // treat '' specially — and one of them eventually will not.
  it.each([[undefined], [''], ['   '], ['\t\n ']])('returns undefined for %j', (raw) => {
    expect(normalizeQuery(raw)).toBeUndefined();
  });

  it('trims the ends', () => {
    expect(normalizeQuery('  arjun  ')).toBe('arjun');
  });

  // Postgres `contains` is a literal substring match, so "priya   sharma" would
  // otherwise miss a row stored as "priya sharma".
  it('collapses internal whitespace', () => {
    expect(normalizeQuery('  priya   sharma  ')).toBe('priya sharma');
  });

  // `q` reaches Postgres as a LIKE pattern on an unindexed column; an unbounded
  // string is an unbounded scan predicate. Truncate rather than reject so a
  // pasted paragraph still searches instead of erroring.
  it('caps the length at 100 characters', () => {
    const got = normalizeQuery('a'.repeat(150));
    expect(got).toHaveLength(100);
  });

  it('leaves an ordinary query untouched', () => {
    expect(normalizeQuery('arjun@example.in')).toBe('arjun@example.in');
  });
});

describe('candidatesHref', () => {
  // The default page is omitted so the canonical URL stays clean.
  it('omits page 1 and an absent query', () => {
    expect(candidatesHref(1)).toBe('/candidates');
    expect(candidatesHref(0)).toBe('/candidates');
  });

  it('emits page alone', () => {
    expect(candidatesHref(2)).toBe('/candidates?page=2');
  });

  it('emits the query alone', () => {
    expect(candidatesHref(1, 'arjun')).toBe('/candidates?q=arjun');
  });

  // Fixed order (q then page) so the pagination links and the over-range
  // redirect can never build two different URLs for the same state.
  it('emits the query BEFORE the page when both are present', () => {
    expect(candidatesHref(3, 'arjun')).toBe('/candidates?q=arjun&page=3');
  });

  // Paging while a search is active must not silently drop the filter.
  it('carries the query through every page', () => {
    expect(candidatesHref(2, 'priya')).toContain('q=priya');
  });

  // A raw '&' or '#' in the box would otherwise terminate the query string and
  // truncate the search server-side.
  it.each([
    ['arjun iyer', '/candidates?q=arjun+iyer'],
    ['a&b', '/candidates?q=a%26b'],
    ['a#b', '/candidates?q=a%23b'],
  ])('percent-encodes %j', (q, expected) => {
    expect(candidatesHref(1, q)).toBe(expected);
  });

  // basePath pin: Next prefixes '/sadmin' itself, so writing it here would
  // resolve to /sadmin/sadmin/candidates and 404. Same assertion the employer
  // list's href builder carries.
  it('is basePath-relative', () => {
    expect(candidatesHref(3, 'arjun').startsWith('/sadmin')).toBe(false);
  });
});

describe('formatHeadline', () => {
  // The whole Candidate row is absent for a seeker who has never opened
  // /profile — which is the majority case on a fresh database, not an edge one.
  it('returns an em dash when there is no candidate profile at all', () => {
    expect(formatHeadline(null)).toBe('—');
  });

  it('returns an em dash when both fields are null', () => {
    expect(formatHeadline({ headline: null, currentTitle: null })).toBe('—');
  });

  // The seeker's own self-description wins over the mechanical job title.
  it('prefers the headline', () => {
    expect(formatHeadline({ headline: 'React developer', currentTitle: 'SDE II' })).toBe(
      'React developer',
    );
  });

  it('falls back to the current title', () => {
    expect(formatHeadline({ headline: null, currentTitle: 'SDE II' })).toBe('SDE II');
  });

  // A headline of spaces is not a headline. Without the trim it would win the
  // precedence and render a blank cell.
  it('falls through a whitespace-only headline', () => {
    expect(formatHeadline({ headline: '   ', currentTitle: 'SDE II' })).toBe('SDE II');
  });

  it('returns an em dash when both fields are whitespace', () => {
    expect(formatHeadline({ headline: '  ', currentTitle: ' ' })).toBe('—');
  });

  it('trims the value it returns', () => {
    expect(formatHeadline({ headline: '  React developer  ', currentTitle: null })).toBe(
      'React developer',
    );
  });
});

describe('initials', () => {
  it.each([[''], ['   ']])('returns ? for a blank name (%j)', (name) => {
    expect(initials(name)).toBe('?');
  });

  it('uses the single initial of a one-word name', () => {
    expect(initials('Arjun')).toBe('A');
  });

  it('uses first and last initials', () => {
    expect(initials('Arjun Iyer')).toBe('AI');
  });

  // First + LAST, not first + second — "Arjun Kumar Iyer" is AI, not AK.
  it('skips middle names', () => {
    expect(initials('Arjun Kumar Iyer')).toBe('AI');
  });

  it('uppercases', () => {
    expect(initials('arjun iyer')).toBe('AI');
  });

  it('collapses irregular spacing', () => {
    expect(initials('  Arjun   Iyer  ')).toBe('AI');
  });

  // A blank User.name falls back to the email upstream, so this is what the
  // avatar actually receives for those rows.
  it('initials an email when that is the display name', () => {
    expect(initials('arjun@example.in')).toBe('A');
  });

  it('handles non-ASCII names', () => {
    expect(initials('अर्जुन अय्यर')).toBe('अअ');
  });
});

// clampPage and lastPageFor are RE-EXPORTED from ../employers/format rather than
// copied, and are fully covered by employers/format.test.ts. These are smoke
// assertions that the re-export is wired — if the module ever stops exporting
// them, this fails here instead of at the page's import site. Same shape as
// otp-sessions/format.test.ts.
describe('re-exported pagination helpers', () => {
  it('clampPage is reachable and clamps', () => {
    expect(clampPage(undefined)).toBe(1);
    expect(clampPage('0')).toBe(1);
    expect(clampPage('abc')).toBe(1);
    expect(clampPage('3')).toBe(3);
  });

  it('lastPageFor is reachable and rounds up', () => {
    expect(lastPageFor(0, 20)).toBe(1);
    expect(lastPageFor(20, 20)).toBe(1);
    expect(lastPageFor(21, 20)).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Candidate detail page
// ---------------------------------------------------------------------------

// The point of this builder is that the master list's state survives a round
// trip to the detail page and back, so these assert the round trip rather than
// just the string shape.
describe('candidateDetailHref', () => {
  it('emits a bare path when there is no list state to carry', () => {
    expect(candidateDetailHref(42, 1, undefined)).toBe('/candidates/42');
  });

  it('omits the default page, matching candidatesHref', () => {
    expect(candidateDetailHref(42, 1, 'priya')).toBe('/candidates/42?q=priya');
  });

  it('carries both params in a fixed order', () => {
    expect(candidateDetailHref(42, 3, 'priya')).toBe('/candidates/42?q=priya&page=3');
  });

  it('carries the page alone', () => {
    expect(candidateDetailHref(42, 3, undefined)).toBe('/candidates/42?page=3');
  });

  it('encodes a query that would otherwise smuggle a second param in', () => {
    const href = candidateDetailHref(7, 2, 'a&b=c');
    expect(href).toBe('/candidates/7?q=a%26b%3Dc&page=2');
    const parsed = new URL(href, 'https://example.test');
    expect(parsed.searchParams.get('q')).toBe('a&b=c');
    expect(parsed.searchParams.get('page')).toBe('2');
  });

  // The invariant that makes the Back link correct: whatever this encodes, the
  // detail page's decoders hand back to candidatesHref unchanged.
  it('round-trips through the same codecs the detail page uses', () => {
    const cases: ReadonlyArray<readonly [number, string | undefined]> = [
      [1, undefined],
      [3, 'priya sharma'],
      [12, 'a&b=c'],
    ];
    for (const [page, q] of cases) {
      const href = candidateDetailHref(99, page, q);
      const parsed = new URL(href, 'https://example.test');
      const decodedQ = normalizeQuery(firstParam(parsed.searchParams.get('q') ?? undefined));
      const decodedPage = clampPage(firstParam(parsed.searchParams.get('page') ?? undefined));
      expect(candidatesHref(decodedPage, decodedQ)).toBe(candidatesHref(page, q));
    }
  });

  // basePath is added by Next itself; writing it here would double-apply it.
  it('never writes the /sadmin basePath', () => {
    expect(candidateDetailHref(1, 2, 'x').startsWith('/candidates/')).toBe(true);
  });
});

// Every table below is a Record keyed by the Prisma enum, so a missing or
// invented member is a COMPILE error. These pin the wording staff actually read.
describe('enum labels', () => {
  it('formatApplicationStatus matches the wording the other three apps use', () => {
    expect(formatApplicationStatus('APPLIED')).toBe('Applied');
    expect(formatApplicationStatus('IN_REVIEW')).toBe('In review');
    expect(formatApplicationStatus('WITHDRAWN')).toBe('Withdrawn');
  });

  it('formatJobStatus calls PENDING_MODERATION what the recruiter is shown', () => {
    expect(formatJobStatus('PENDING_MODERATION')).toBe('Under review');
    expect(formatJobStatus('ACTIVE')).toBe('Live');
    expect(formatJobStatus('EXPIRED')).toBe('Expired');
  });

  it('nullable enum formatters answer an em dash rather than throwing', () => {
    expect(formatWorkStatus(null)).toBe('—');
    expect(formatLookingFor(null)).toBe('—');
    expect(formatGender(null)).toBe('—');
  });

  // apps/web disagrees with itself here — ProfileForm says "Working" while the
  // onboarding step says "Experienced". The enum member wins on a staff console.
  it('formatWorkStatus follows the enum, not the onboarding wizard', () => {
    expect(formatWorkStatus('EXPERIENCED')).toBe('Experienced');
    expect(formatWorkStatus('FRESHER')).toBe('Fresher');
  });

  it('formatLookingFor spells BOTH out', () => {
    expect(formatLookingFor('BOTH')).toBe('Job or internship');
  });

  it('formatGender never renders the raw PREFER_NOT_TO_SAY', () => {
    expect(formatGender('PREFER_NOT_TO_SAY')).toBe('Prefer not to say');
  });

  it('formatLanguageProficiency covers every member', () => {
    expect(formatLanguageProficiency('BEGINNER')).toBe('Beginner');
    expect(formatLanguageProficiency('INTERMEDIATE')).toBe('Intermediate');
    expect(formatLanguageProficiency('ADVANCED')).toBe('Advanced');
  });

  // PENDING is the column DEFAULT, so it is the ordinary state, not an alarm.
  it('formatScanStatus words PENDING as a fact rather than a warning', () => {
    expect(formatScanStatus('PENDING')).toBe('Scan pending');
    expect(formatScanStatus('CLEAN')).toBe('Scanned clean');
    expect(formatScanStatus('INFECTED')).toBe('Malware detected');
  });

  it('formatProfileAuditAction covers the actions a CANDIDATE can produce', () => {
    expect(formatProfileAuditAction('PROFILE_UPDATE')).toBe('Updated profile');
    expect(formatProfileAuditAction('RESUME_UPLOAD')).toBe('Uploaded a CV');
    expect(formatProfileAuditAction('RESUME_DELETE')).toBe('Removed a CV');
    expect(formatProfileAuditAction('SKILLS_UPDATE')).toBe('Updated skills');
    expect(formatProfileAuditAction('EDUCATION_ADD')).toBe('Added education');
    expect(formatProfileAuditAction('EXPERIENCE_DELETE')).toBe('Removed work experience');
  });

  // The record is exhaustive by construction; this pins that no entry was
  // filled in with the enum member itself as a placeholder.
  it('formatProfileAuditAction never returns a raw SCREAMING_SNAKE value', () => {
    expect(formatProfileAuditAction('OTP_CODE_REVEALED')).toBe('Revealed a signup OTP');
    expect(formatProfileAuditAction('BILLING_PAYMENT_FAILED')).toBe('Payment failed');
  });
});

describe('formatExperienceMonths', () => {
  it('answers an em dash for an unset value', () => {
    expect(formatExperienceMonths(null)).toBe('—');
  });

  it('says so in words when there is genuinely none', () => {
    expect(formatExperienceMonths(0)).toBe('No experience yet');
  });

  it('converts months to years', () => {
    expect(formatExperienceMonths(12)).toBe('1 yr');
    expect(formatExperienceMonths(24)).toBe('2 yrs');
  });

  // Sub-year precision is the whole reason the column is months (SRS §4.3.1).
  it('keeps sub-year precision', () => {
    expect(formatExperienceMonths(18)).toBe('1.5 yrs');
    expect(formatExperienceMonths(30)).toBe('2.5 yrs');
  });

  it('rounds to one decimal rather than printing a repeating fraction', () => {
    expect(formatExperienceMonths(7)).toBe('0.6 yrs');
  });

  it('refuses a negative rather than rendering "-1 yrs"', () => {
    expect(formatExperienceMonths(-6)).toBe('—');
  });
});

describe('formatCurrentSalary', () => {
  it('answers an em dash for an unset value', () => {
    expect(formatCurrentSalary(null)).toBe('—');
  });

  // The reason this function exists at all. formatSalaryLpa(x, null) renders a
  // lone value as "₹12+ LPA" — a FLOOR — which for an exact current salary tells
  // staff the person earns at least what they in fact earn.
  it('renders one figure as an exact amount, never as a floor', () => {
    expect(formatCurrentSalary(120_000_000)).toBe('₹12 LPA');
    expect(formatCurrentSalary(120_000_000)).not.toContain('+');
  });

  it('uses the same paise-to-LPA divisor as the job console', () => {
    // 1 LPA = 100,000 rupees = 10,000,000 paise.
    expect(formatCurrentSalary(10_000_000)).toBe('₹1 LPA');
  });

  it('keeps one decimal and drops a trailing zero', () => {
    expect(formatCurrentSalary(125_000_000)).toBe('₹12.5 LPA');
    expect(formatCurrentSalary(80_000_000)).toBe('₹8 LPA');
  });

  // Deliberate: formatSalaryLpa has no crore branch, so a candidate salary and
  // a job salary must read in the same unit on the same console.
  it('stays in LPA past a crore', () => {
    expect(formatCurrentSalary(1_500_000_000)).toBe('₹150 LPA');
  });

  it('handles zero without pretending it is unset', () => {
    expect(formatCurrentSalary(0)).toBe('₹0 LPA');
  });
});

describe('formatNoticePeriod', () => {
  it('answers an em dash for an unset value', () => {
    expect(formatNoticePeriod(null)).toBe('—');
  });

  it('uses the canonical labels the seeker actually picked from', () => {
    expect(formatNoticePeriod(0)).toBe('Immediate');
    expect(formatNoticePeriod(15)).toBe('15 days');
    expect(formatNoticePeriod(30)).toBe('1 month');
    expect(formatNoticePeriod(60)).toBe('2 months');
    expect(formatNoticePeriod(90)).toBe('3 months');
    expect(formatNoticePeriod(120)).toBe('More than 3 months');
  });

  it('falls back to a literal day count rather than snapping to a bucket', () => {
    expect(formatNoticePeriod(45)).toBe('45 days');
    expect(formatNoticePeriod(1)).toBe('1 day');
  });

  it('refuses a negative', () => {
    expect(formatNoticePeriod(-30)).toBe('—');
  });
});

describe('formatBytes', () => {
  it('uses bytes below a kilobyte', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(999)).toBe('999 B');
  });

  it('switches unit at each threshold', () => {
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1024 * 1024)).toBe('1 MB');
  });

  it('keeps one decimal', () => {
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(2_621_440)).toBe('2.5 MB');
  });

  it('refuses a negative rather than rendering "-1 KB"', () => {
    expect(formatBytes(-5)).toBe('—');
  });
});

// startYear/endYear are Int columns. A date formatter would turn 2019 into
// 1 Jan 1970, so this stays arithmetic-free.
describe('formatEducationYears', () => {
  it('renders a closed range', () => {
    expect(formatEducationYears(2016, 2020)).toBe('2016 – 2020');
  });

  it('renders an ongoing course', () => {
    expect(formatEducationYears(2024, null)).toBe('2024 – present');
  });

  it('renders a single-year course without collapsing the range', () => {
    expect(formatEducationYears(2020, 2020)).toBe('2020 – 2020');
  });
});

describe('isOngoingExperience', () => {
  it('is ongoing when the seeker ticked "I work here"', () => {
    expect(isOngoingExperience({ isCurrent: true, endDate: null })).toBe(true);
  });

  it('is ongoing when there is simply no end date', () => {
    expect(isOngoingExperience({ isCurrent: false, endDate: null })).toBe(true);
  });

  it('is finished when both columns agree it is', () => {
    expect(isOngoingExperience({ isCurrent: false, endDate: new Date('2023-06-30') })).toBe(false);
  });

  // The two columns can disagree — isCurrent is a checkbox, endDate is
  // nullable. The tick wins, so a stale end date is not printed beside a claim
  // to still be working there.
  it('lets the tick win over a stale end date', () => {
    expect(isOngoingExperience({ isCurrent: true, endDate: new Date('2020-01-01') })).toBe(true);
  });
});

describe('formatSessionState', () => {
  const now = new Date('2026-08-14T12:00:00Z');

  it('is Active while it is neither revoked nor expired', () => {
    expect(
      formatSessionState({ revokedAt: null, expiresAt: new Date('2026-09-13T12:00:00Z') }, now),
    ).toBe('Active');
  });

  it('is Expired once the expiry has passed', () => {
    expect(
      formatSessionState({ revokedAt: null, expiresAt: new Date('2026-08-14T11:59:59Z') }, now),
    ).toBe('Expired');
  });

  // Deliberately NOT "Signed out": revokedAt is stamped both by an explicit
  // sign-out and by every refresh-token rotation, and the row cannot tell them
  // apart. "Signed out" would report a deliberate act for what is almost always
  // a routine 15-minute rotation.
  it('says Ended, never "Signed out", for a revoked row', () => {
    const state = formatSessionState(
      { revokedAt: new Date('2026-08-14T10:00:00Z'), expiresAt: new Date('2026-09-13T12:00:00Z') },
      now,
    );
    expect(state).toBe('Ended');
  });

  it('reports a revoked row as Ended even after it would also have expired', () => {
    expect(
      formatSessionState(
        {
          revokedAt: new Date('2026-07-01T10:00:00Z'),
          expiresAt: new Date('2026-07-31T10:00:00Z'),
        },
        now,
      ),
    ).toBe('Ended');
  });

  // apps/api counts active sessions with expiresAt: { gt: now }, so a session
  // expiring exactly now is NOT active. The two must agree, or the headline
  // count and the row states contradict each other on the same screen.
  it('treats the exact expiry instant as expired, matching the API predicate', () => {
    expect(formatSessionState({ revokedAt: null, expiresAt: now }, now)).toBe('Expired');
  });
});

describe('formatSectionCap', () => {
  // Returning null below the cap is what stops a complete list being labelled
  // as though something were hidden.
  it('says nothing when the section is complete', () => {
    expect(formatSectionCap(20, 20, 'applications')).toBeNull();
    expect(formatSectionCap(3, 3, 'applications')).toBeNull();
    expect(formatSectionCap(0, 0, 'applications')).toBeNull();
  });

  it('states both numbers when the section is truncated', () => {
    expect(formatSectionCap(20, 137, 'applications')).toBe(
      'Showing the latest 20 of 137 applications.',
    );
  });

  it('groups digits the Indian way, like every other count in this console', () => {
    expect(formatSectionCap(20, 1_200_000, 'sessions')).toBe(
      'Showing the latest 20 of 12,00,000 sessions.',
    );
  });

  it('is driven by the same constant the query pages on', () => {
    expect(CANDIDATE_APPLICATIONS_LIMIT).toBe(20);
    expect(formatSectionCap(CANDIDATE_APPLICATIONS_LIMIT, 21, 'applications')).toBe(
      'Showing the latest 20 of 21 applications.',
    );
  });
});

// The profile DTOs declare these columns as z.string().max(N).optional() with no
// .trim() and no .min(1), so a seeker who types a single space stores ' ' — a
// value that is neither null nor visible. `?? '—'` does not catch it.
describe('orDash', () => {
  it('returns an em dash for null and undefined', () => {
    expect(orDash(null)).toBe('—');
    expect(orDash(undefined)).toBe('—');
  });

  it('returns an em dash for an empty string, which ?? would not', () => {
    expect(orDash('')).toBe('—');
  });

  it('returns an em dash for whitespace only', () => {
    expect(orDash('   ')).toBe('—');
    expect(orDash('\t\n')).toBe('—');
  });

  it('trims a real value, so the detail page and the master list agree', () => {
    // formatHeadline has trimmed since the list shipped; these two must not
    // render the same stored value differently.
    expect(orDash('  Staff Engineer  ')).toBe('Staff Engineer');
    expect(orDash('  Staff Engineer  ')).toBe(formatHeadline({ headline: '  Staff Engineer  ', currentTitle: null }));
  });

  it('passes an ordinary value through unchanged', () => {
    expect(orDash('Bengaluru')).toBe('Bengaluru');
  });
});

describe('hasText', () => {
  it('is false for every flavour of absent', () => {
    expect(hasText(null)).toBe(false);
    expect(hasText(undefined)).toBe(false);
    expect(hasText('')).toBe(false);
    expect(hasText('   ')).toBe(false);
  });

  it('is true only for real content', () => {
    expect(hasText('a')).toBe(true);
    expect(hasText('  a  ')).toBe(true);
  });

  // The card must not mount for whitespace: `{summary && <Card/>}` is truthy
  // for '   ' and renders an About card containing nothing visible.
  it('disagrees with bare truthiness exactly where it matters', () => {
    const whitespace = '   ';
    expect(Boolean(whitespace)).toBe(true);
    expect(hasText(whitespace)).toBe(false);
  });
});

describe('formatSignInMethod', () => {
  const base = { hasGoogleLinked: false, hasAppleLinked: false };

  it('names each signup method', () => {
    expect(formatSignInMethod({ ...base, provider: 'LOCAL' })).toBe('Email and password');
    expect(formatSignInMethod({ ...base, provider: 'GOOGLE' })).toBe('Google');
    expect(formatSignInMethod({ ...base, provider: 'APPLE' })).toBe('Apple');
  });

  // provider records only the SIGNUP method. User.appleId's schema comment
  // spells out the case: signed up with Google on the web, later used Apple on
  // a phone, same account.
  it('reports an additionally linked identity that provider alone hides', () => {
    expect(formatSignInMethod({ provider: 'GOOGLE', hasGoogleLinked: true, hasAppleLinked: true })).toBe(
      'Google (also linked: Apple)',
    );
    expect(formatSignInMethod({ provider: 'LOCAL', hasGoogleLinked: true, hasAppleLinked: true })).toBe(
      'Email and password (also linked: Google, Apple)',
    );
  });

  it('does not list the signup provider again as an extra', () => {
    expect(formatSignInMethod({ provider: 'GOOGLE', hasGoogleLinked: true, hasAppleLinked: false })).toBe(
      'Google',
    );
    expect(formatSignInMethod({ provider: 'APPLE', hasGoogleLinked: false, hasAppleLinked: true })).toBe(
      'Apple',
    );
  });

  // The regression this function was rewritten for: it used to be a ternary
  // chain ending in a bare `: 'Apple'`, so any provider that was not LOCAL or
  // GOOGLE rendered as Apple. A keyed Record cannot do that — a new enum member
  // is a compile error instead.
  it('never falls through to Apple for a non-Apple provider', () => {
    for (const provider of ['LOCAL', 'GOOGLE'] as const) {
      expect(formatSignInMethod({ ...base, provider })).not.toBe('Apple');
    }
  });
});

// Deliberately never says "deleted": ResumeService.upload soft-deletes the
// previous active resume inside the upload transaction, so replacing a CV puts
// the old row in this bucket without the candidate deleting anything.
describe('formatHiddenResumes', () => {
  it('says nothing when there is nothing hidden', () => {
    expect(formatHiddenResumes(0)).toBeNull();
    expect(formatHiddenResumes(-1)).toBeNull();
  });

  it('is singular for one', () => {
    expect(formatHiddenResumes(1)).toBe('1 older or removed CV is not shown.');
  });

  it('is plural beyond one, grouped the Indian way', () => {
    expect(formatHiddenResumes(3)).toBe('3 older or removed CVs are not shown.');
    expect(formatHiddenResumes(100000)).toBe('1,00,000 older or removed CVs are not shown.');
  });

  it('does not attribute a supersession to a deletion', () => {
    expect(formatHiddenResumes(3)).not.toContain('deleted');
  });
});
