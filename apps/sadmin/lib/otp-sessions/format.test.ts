import { describe, expect, it } from 'vitest';
import {
  clampPage,
  deriveChallengeState,
  formatIndianMobile,
  formatTimeIst,
  lastPageFor,
  otpSessionsHref,
  pivotSignupRows,
  resolveSignupName,
  type OtpSessionChallenge,
} from './format';

const NOW = new Date('2026-07-29T10:00:00Z');

// A challenge row with sane defaults; each test overrides only what it is about.
// Note there is no `code` field to override — the console never loads one.
function challenge(over: Partial<OtpSessionChallenge> = {}): OtpSessionChallenge {
  return {
    id: 1,
    signupId: 'a1b2',
    channel: 'EMAIL',
    destination: 'priya@example.in',
    name: 'Priya Sharma',
    expiresAt: new Date('2026-07-29T10:10:00Z'),
    verifiedAt: null,
    lastSentAt: new Date('2026-07-29T09:55:00Z'),
    ...over,
  };
}

describe('deriveChallengeState', () => {
  // An absent row means the registrant never asked for a code on that channel,
  // which the table shows as an em-dash rather than an empty cell.
  it('reports ABSENT when the channel has no row at all', () => {
    expect(deriveChallengeState(null, NOW)).toBe('ABSENT');
  });

  it('reports LIVE for an unverified code that has not expired', () => {
    expect(deriveChallengeState(challenge(), NOW)).toBe('LIVE');
  });

  it('reports EXPIRED once the expiry has passed', () => {
    expect(deriveChallengeState(challenge({ expiresAt: new Date(NOW.getTime() - 1) }), NOW)).toBe(
      'EXPIRED',
    );
  });

  // The boundary counts as expired: a code with nothing left on it is not worth
  // reading down a phone line.
  it('counts the expiry instant itself as expired', () => {
    expect(deriveChallengeState(challenge({ expiresAt: NOW }), NOW)).toBe('EXPIRED');
  });

  it('reports VERIFIED once the correct code has been entered', () => {
    expect(deriveChallengeState(challenge({ verifiedAt: NOW }), NOW)).toBe('VERIFIED');
  });

  // Verification is a fact that already happened, so it outranks the code's own
  // expiry — there is nothing left to relay on that channel either way, and
  // "Expired" would send staff chasing a code the registrant has already used.
  it('keeps VERIFIED ahead of EXPIRED when a verified code has since expired', () => {
    expect(
      deriveChallengeState(
        challenge({
          verifiedAt: new Date('2026-07-29T09:58:00Z'),
          expiresAt: new Date('2026-07-29T09:59:00Z'),
        }),
        NOW,
      ),
    ).toBe('VERIFIED');
  });
});

describe('resolveSignupName', () => {
  it('returns null when there is nothing to read', () => {
    expect(resolveSignupName([])).toBeNull();
  });

  // Both rows snapshot what was typed at request time, so they can legitimately
  // disagree — someone who corrects a typo before requesting the second code
  // leaves the old spelling on the first row.
  it('prefers the most recently generated row', () => {
    const older = challenge({
      id: 1,
      name: 'Priya Sharm',
      lastSentAt: new Date('2026-07-29T09:50:00Z'),
    });
    const newer = challenge({
      id: 2,
      channel: 'PHONE',
      name: 'Priya Sharma',
      lastSentAt: new Date('2026-07-29T09:55:00Z'),
    });
    expect(resolveSignupName([older, newer])).toBe('Priya Sharma');
    expect(resolveSignupName([newer, older])).toBe('Priya Sharma');
  });

  it('breaks an exact-millisecond tie on id, so the same data renders the same name', () => {
    const sameInstant = new Date('2026-07-29T09:55:00Z');
    const a = challenge({ id: 4, name: 'First write', lastSentAt: sameInstant });
    const b = challenge({ id: 9, name: 'Second write', lastSentAt: sameInstant });
    expect(resolveSignupName([a, b])).toBe('Second write');
    expect(resolveSignupName([b, a])).toBe('Second write');
  });

  it('skips a blank name in favour of a row that has one', () => {
    const blank = challenge({ id: 2, name: '   ', lastSentAt: new Date('2026-07-29T09:59:00Z') });
    const named = challenge({ id: 1, name: 'Priya Sharma' });
    expect(resolveSignupName([blank, named])).toBe('Priya Sharma');
  });

  it('trims what it returns and reports null when every row is blank', () => {
    expect(resolveSignupName([challenge({ name: '  Priya Sharma  ' })])).toBe('Priya Sharma');
    expect(resolveSignupName([challenge({ name: '' }), challenge({ id: 2, name: '  ' })])).toBeNull();
  });
});

describe('pivotSignupRows', () => {
  const NEWER_AT = new Date('2026-07-29T09:55:00Z');
  const OLDER_AT = new Date('2026-07-29T09:30:00Z');
  const newerEntry = { signupId: 'newer', lastGeneratedAt: NEWER_AT };
  const olderEntry = { signupId: 'older', lastGeneratedAt: OLDER_AT };

  it('pairs the two channel rows onto one signup attempt', () => {
    const rows = pivotSignupRows(
      [newerEntry],
      [
        challenge({ id: 1, signupId: 'newer', channel: 'EMAIL', destination: 'p@x.in' }),
        challenge({ id: 2, signupId: 'newer', channel: 'PHONE', destination: '+919876543210' }),
      ],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.email?.destination).toBe('p@x.in');
    expect(rows[0]?.phone?.destination).toBe('+919876543210');
    expect(rows[0]?.name).toBe('Priya Sharma');
  });

  // A registrant who has asked for one code but not the other is the normal
  // mid-signup state, not a broken row.
  it('leaves the un-requested channel null', () => {
    const rows = pivotSignupRows([newerEntry], [challenge({ signupId: 'newer', channel: 'EMAIL' })]);
    expect(rows[0]?.email).not.toBeNull();
    expect(rows[0]?.phone).toBeNull();
  });

  // The ordering key is max(lastSentAt) per attempt, which only exists on the
  // grouped paging query — re-deriving it here could disagree with the
  // LIMIT/OFFSET that chose the page.
  it('keeps the order of the paging query, not of the challenge rows', () => {
    const rows = pivotSignupRows(
      [newerEntry, olderEntry],
      [
        challenge({ id: 1, signupId: 'older', lastSentAt: OLDER_AT }),
        challenge({ id: 2, signupId: 'newer' }),
      ],
    );
    expect(rows.map((r) => r.signupId)).toEqual(['newer', 'older']);
    expect(rows[0]?.lastGeneratedAt).toEqual(NEWER_AT);
  });

  // Registering deletes the verified pair and the hourly purge deletes stale
  // rows, so an attempt really can disappear between the two queries.
  it('drops an attempt whose rows vanished between the paging query and the fetch', () => {
    const rows = pivotSignupRows([newerEntry, olderEntry], [challenge({ signupId: 'newer' })]);
    expect(rows.map((r) => r.signupId)).toEqual(['newer']);
  });

  it('returns nothing for an empty page', () => {
    expect(pivotSignupRows([], [challenge()])).toEqual([]);
  });
});

describe('formatIndianMobile', () => {
  it.each([
    ['+919876543210', '+91 98765 43210'],
    ['+91 98765 43210', '+91 98765 43210'],
    ['+91-98765-43210', '+91 98765 43210'],
    // The '+' is preserved, never invented — this column is also how an admin
    // checks what was actually typed.
    ['919876543210', '91 98765 43210'],
    ['9876543210', '98765 43210'],
    ['98765 43210', '98765 43210'],
    // Trunk-prefixed, as dialled from an Indian landline.
    ['09876543210', '0 98765 43210'],
  ])('groups %j as %j', (raw, expected) => {
    expect(formatIndianMobile(raw)).toBe(expected);
  });

  it('is idempotent, so re-rendering an already-grouped number cannot drift', () => {
    const once = formatIndianMobile('+919876543210');
    expect(formatIndianMobile(once)).toBe(once);
  });

  // Reshaping a foreign number into something Indian-looking would be a lie, and
  // a typo has to be visible as a typo.
  it.each([
    ['+14155550123', '+14155550123'],
    ['+44 20 7946 0958', '+44 20 7946 0958'],
    ['98765', '98765'],
    ['not a number', 'not a number'],
    // A '+' followed by ten digits is not valid in any dialling plan.
    ['+9876543210', '+9876543210'],
  ])('returns %j untouched', (raw, expected) => {
    expect(formatIndianMobile(raw)).toBe(expected);
  });

  it('trims surrounding whitespace', () => {
    expect(formatIndianMobile('  9876543210  ')).toBe('98765 43210');
    expect(formatIndianMobile('  not a number  ')).toBe('not a number');
  });

  it('never loses or invents a digit', () => {
    const raw = '+919876543210';
    expect(formatIndianMobile(raw).replace(/\D/g, '')).toBe(raw.replace(/\D/g, ''));
  });
});

describe('formatTimeIst', () => {
  // India is UTC+5:30, so a UTC time is never the time staff will say out loud.
  it('renders clock time in IST', () => {
    expect(formatTimeIst(new Date('2026-07-29T10:17:00Z'))).toBe('3:47 pm');
  });

  it('accepts the ISO string the reveal endpoint returns', () => {
    expect(formatTimeIst('2026-07-29T10:17:00Z')).toBe('3:47 pm');
  });

  it('renders an unparseable value as the em-dash rather than "Invalid Date"', () => {
    expect(formatTimeIst('not a date')).toBe('—');
  });
});

describe('otpSessionsHref', () => {
  it('omits the default page so the URL stays clean', () => {
    expect(otpSessionsHref(1)).toBe('/otp-sessions');
  });

  it('is basePath-relative — Next adds /sadmin itself', () => {
    expect(otpSessionsHref(4)).toBe('/otp-sessions?page=4');
    expect(otpSessionsHref(4).startsWith('/sadmin')).toBe(false);
  });
});

// clampPage and lastPageFor are re-exported from lib/employers/format and fully
// covered there. Pinned here too, because this page's over-range redirect and
// its pagination links both depend on the pair agreeing — if the re-export ever
// became a private copy, this is what would notice.
describe('re-exported pagination helpers', () => {
  it('clamps a hand-typed ?page before it reaches the query', () => {
    expect(clampPage(undefined)).toBe(1);
    expect(clampPage('0')).toBe(1);
    expect(clampPage('3')).toBe(3);
    expect(clampPage('99999999999')).toBe(1_000_000);
  });

  it('spans the page size this table uses', () => {
    expect(lastPageFor(0, 20)).toBe(1);
    expect(lastPageFor(20, 20)).toBe(1);
    expect(lastPageFor(21, 20)).toBe(2);
  });
});
