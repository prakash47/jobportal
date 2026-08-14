import { describe, expect, it } from 'vitest';
import {
  DEFAULT_JOB_POSTING_TAB,
  JOB_POSTINGS_PAGE_SIZE,
  JOB_POSTING_STATUS_LABEL,
  JOB_POSTING_TABS,
  JOB_POSTING_TAB_LABEL,
  canDeleteJobPosting,
  clampPage,
  formatJobPostingStatus,
  formatJobPostingsSummary,
  formatJobType,
  jobPostingDeleteBlockedReason,
  jobPostingDetailHref,
  jobPostingsHref,
  normalizeQuery,
  parseStatusTab,
} from './format';

describe('parseStatusTab', () => {
  it('defaults to Active when the param is absent', () => {
    expect(parseStatusTab(undefined)).toBe('ACTIVE');
    expect(DEFAULT_JOB_POSTING_TAB).toBe('ACTIVE');
  });

  it('accepts every declared tab', () => {
    for (const tab of JOB_POSTING_TABS) {
      expect(parseStatusTab(tab)).toBe(tab);
    }
  });

  it('accepts a hand-typed lowercase status', () => {
    expect(parseStatusTab('active')).toBe('ACTIVE');
    expect(parseStatusTab('pending_moderation')).toBe('PENDING_MODERATION');
    expect(parseStatusTab('  closed  ')).toBe('CLOSED');
  });

  // A repeated key arrives as an array. The sibling ?q param reaching .trim() on
  // an array is a 500 this repo has already taken; this one must not repeat it.
  it('takes the first value when the key is repeated', () => {
    expect(parseStatusTab(['DRAFT', 'CLOSED'])).toBe('DRAFT');
    expect(parseStatusTab([])).toBe('ACTIVE');
  });

  // An arbitrary string must never reach where.status, where Prisma raises a
  // validation error rather than degrading gracefully.
  it('falls back to the default for an unknown status', () => {
    expect(parseStatusTab('WHATEVER')).toBe('ACTIVE');
    expect(parseStatusTab('')).toBe('ACTIVE');
    expect(parseStatusTab('DELETED')).toBe('ACTIVE');
  });

  // The prototype-chain class of bug already found once on the SRP: these all
  // resolve to a truthy value when used to index a plain object, so a
  // `if (MAP[raw])` guard would let them through.
  it('is not fooled by prototype-chain keys', () => {
    expect(parseStatusTab('__proto__')).toBe('ACTIVE');
    expect(parseStatusTab('constructor')).toBe('ACTIVE');
    expect(parseStatusTab('toString')).toBe('ACTIVE');
    expect(parseStatusTab('hasOwnProperty')).toBe('ACTIVE');
  });
});

describe('status labels', () => {
  // A missing or invented member is a compile error, but an exhaustive runtime
  // check also catches a member added to the enum without a label.
  it('labels every tab, including the ALL pseudo-status', () => {
    for (const tab of JOB_POSTING_TABS) {
      expect(JOB_POSTING_TAB_LABEL[tab]).toBeTruthy();
    }
    expect(JOB_POSTING_TAB_LABEL.ALL).toBe('All');
  });

  // The wording decided for this console. ACTIVE has three live spellings in
  // this repo ('Live', 'Open', 'Active'); this surface uses the enum word, and
  // PENDING_MODERATION uses the majority spelling. Pinned so a later tidy-up of
  // the other maps cannot quietly change this one too.
  it('uses this console’s agreed wording', () => {
    expect(formatJobPostingStatus('ACTIVE')).toBe('Active');
    expect(formatJobPostingStatus('PENDING_MODERATION')).toBe('Under review');
    expect(formatJobPostingStatus('DRAFT')).toBe('Draft');
    expect(formatJobPostingStatus('EXPIRED')).toBe('Expired');
    expect(formatJobPostingStatus('CLOSED')).toBe('Closed');
    expect(Object.keys(JOB_POSTING_STATUS_LABEL)).toHaveLength(5);
  });
});

describe('jobPostingsHref', () => {
  it('omits every default, so the canonical view is a bare path', () => {
    expect(jobPostingsHref('ACTIVE', 1)).toBe('/job-postings');
    expect(jobPostingsHref('ACTIVE', 1, undefined)).toBe('/job-postings');
  });

  it('emits status, q and page in a fixed order', () => {
    expect(jobPostingsHref('DRAFT', 3, 'acme')).toBe('/job-postings?status=DRAFT&q=acme&page=3');
  });

  // The whole reason this builder exists. The review queue's private pageHref
  // drops unknown params by construction; copying that shape would make clicking
  // a status tab silently wipe the admin's search.
  it('carries the active search across a tab change', () => {
    expect(jobPostingsHref('CLOSED', 1, 'engineer')).toContain('q=engineer');
  });

  it('carries the active search across a page change', () => {
    expect(jobPostingsHref('ACTIVE', 2, 'engineer')).toBe('/job-postings?q=engineer&page=2');
  });

  it('encodes a query that would otherwise break the URL', () => {
    expect(jobPostingsHref('ACTIVE', 1, 'a&b=c d')).toBe('/job-postings?q=a%26b%3Dc+d');
  });

  // Next prefixes '/sadmin' itself — an absolute href here resolves to
  // /sadmin/sadmin/job-postings.
  it('is basePath-relative', () => {
    expect(jobPostingsHref('ALL', 2, 'x').startsWith('/sadmin')).toBe(false);
    expect(jobPostingDetailHref(9, 'ALL', 2, 'x').startsWith('/sadmin')).toBe(false);
  });
});

describe('jobPostingDetailHref', () => {
  it('carries the exact list state so Back returns to the same filtered page', () => {
    expect(jobPostingDetailHref(42, 'EXPIRED', 4, 'acme')).toBe(
      '/job-postings/42?status=EXPIRED&q=acme&page=4',
    );
  });

  it('stays clean on the default view', () => {
    expect(jobPostingDetailHref(42, 'ACTIVE', 1)).toBe('/job-postings/42');
  });

  // Linking at /jobs/:id would jump the sidebar highlight onto "Job review"
  // (SidebarNav matches a `${href}/` prefix) and land the admin on a moderation
  // screen.
  it('points at the job-postings route, never the moderation route', () => {
    expect(jobPostingDetailHref(42, 'ACTIVE', 1).startsWith('/job-postings/')).toBe(true);
  });
});

// The round trip a real request makes: an href built here is parsed back by the
// very same helpers on the far side, so the two ends cannot disagree about what
// a given state means.
describe('href → param round trip', () => {
  it('survives being parsed back by the page’s own helpers', () => {
    const href = jobPostingsHref('PENDING_MODERATION', 5, '  acme   corp  ');
    const parsed = new URL(href, 'https://x.test').searchParams;

    expect(parseStatusTab(parsed.get('status') ?? undefined)).toBe('PENDING_MODERATION');
    expect(clampPage(parsed.get('page') ?? undefined)).toBe(5);
    // normalizeQuery collapsed the whitespace before the href was built, so the
    // value round-trips unchanged rather than re-collapsing differently.
    expect(normalizeQuery(parsed.get('q') ?? undefined)).toBe('acme corp');
  });

  it('round-trips the default view to the default state', () => {
    const parsed = new URL(jobPostingsHref('ACTIVE', 1), 'https://x.test').searchParams;
    expect(parseStatusTab(parsed.get('status') ?? undefined)).toBe('ACTIVE');
    expect(clampPage(parsed.get('page') ?? undefined)).toBe(1);
    expect(normalizeQuery(parsed.get('q') ?? undefined)).toBeUndefined();
  });
});

describe('canDeleteJobPosting', () => {
  // The invariant that protects candidates' application history. Application is
  // onDelete: Cascade on Job, so relaxing this destroys rows seekers can still
  // see in their own /applications tracker.
  it('allows deletion only with zero applications', () => {
    expect(canDeleteJobPosting({ applicationCount: 0 })).toBe(true);
    expect(canDeleteJobPosting({ applicationCount: 1 })).toBe(false);
    expect(canDeleteJobPosting({ applicationCount: 250 })).toBe(false);
  });

  it('gives no reason when the posting is deletable', () => {
    expect(jobPostingDeleteBlockedReason({ applicationCount: 0 })).toBeNull();
  });

  it('states the count, singular and plural, when it is not', () => {
    expect(jobPostingDeleteBlockedReason({ applicationCount: 1 })).toContain('1 application —');
    expect(jobPostingDeleteBlockedReason({ applicationCount: 2 })).toContain('2 applications');
    // Indian digit grouping, matching every other count in this console.
    expect(jobPostingDeleteBlockedReason({ applicationCount: 1234 })).toContain('1,234');
  });
});

describe('formatJobType', () => {
  // This field was fetched but never rendered until the detail view surfaced it,
  // and the first version printed the raw column — a super admin saw "FREE".
  it('labels every JobType member, never the raw enum', () => {
    expect(formatJobType('FREE')).toBe('Free Job');
    expect(formatJobType('HOT_VACANCY')).toBe('Hot Vacancy');
    expect(formatJobType('SMB')).toBe('SMB Pack');
    expect(formatJobType('INTERNSHIP')).toBe('Internship');
  });

  // The API types are hand-mirrored as `string`, so an unknown value is
  // reachable. A read-only staff screen must degrade, not throw.
  it('falls back to the raw value rather than throwing on an unknown type', () => {
    expect(formatJobType('SOMETHING_NEW')).toBe('SOMETHING_NEW');
    expect(formatJobType('')).toBe('');
  });

  it('is not fooled by prototype-chain keys', () => {
    expect(formatJobType('__proto__')).toBe('__proto__');
    expect(formatJobType('toString')).toBe('toString');
  });
});

describe('formatJobPostingsSummary', () => {
  // The naive `${n} postings ${label.toLowerCase()}` template produced
  // "1 posting draft" — the labels are a mix of adjectives and a prepositional
  // phrase, so every tab is spelled out. These read like English or they are wrong.
  it('reads as English on every tab', () => {
    expect(formatJobPostingsSummary(53, 'ACTIVE')).toBe('53 active postings');
    expect(formatJobPostingsSummary(1, 'DRAFT')).toBe('1 draft posting');
    expect(formatJobPostingsSummary(4, 'DRAFT')).toBe('4 draft postings');
    expect(formatJobPostingsSummary(1, 'PENDING_MODERATION')).toBe('1 posting under review');
    expect(formatJobPostingsSummary(6, 'PENDING_MODERATION')).toBe('6 postings under review');
    expect(formatJobPostingsSummary(2, 'EXPIRED')).toBe('2 expired postings');
    expect(formatJobPostingsSummary(2, 'CLOSED')).toBe('2 closed postings');
  });

  // The ALL tab is unfiltered, so it must not describe the rows as anything.
  it('drops the status word on the All tab', () => {
    expect(formatJobPostingsSummary(53, 'ALL')).toBe('53 postings');
    expect(formatJobPostingsSummary(1, 'ALL')).toBe('1 posting');
  });

  it('names the active search', () => {
    expect(formatJobPostingsSummary(3, 'ACTIVE', 'sutra')).toBe(
      '3 active postings matching “sutra”',
    );
  });

  it('groups large counts the Indian way, like every other count in the console', () => {
    expect(formatJobPostingsSummary(12345, 'ALL')).toBe('12,345 postings');
  });

  // ⚠ The empty copy must never claim more than it knows. This console lands on
  // the ACTIVE tab, so the list is filtered by DEFAULT — "no jobs have been
  // posted yet" would be flatly false with a hundred drafts in the table.
  it('never claims the platform is empty while a filter is on', () => {
    expect(formatJobPostingsSummary(0, 'DRAFT')).toBe('There are no draft postings right now.');
    expect(formatJobPostingsSummary(0, 'ACTIVE')).toBe('There are no active postings right now.');
    expect(formatJobPostingsSummary(0, 'PENDING_MODERATION')).toBe(
      'There are no postings under review right now.',
    );
    expect(formatJobPostingsSummary(0, 'ACTIVE')).not.toContain('posted yet');
  });

  it('only says the platform is empty on an unfiltered, unsearched All tab', () => {
    expect(formatJobPostingsSummary(0, 'ALL')).toBe('No jobs have been posted yet.');
    expect(formatJobPostingsSummary(0, 'ALL', 'zzz')).toBe('No postings match “zzz”.');
  });

  it('blames the search, not the platform, when a search returns nothing', () => {
    expect(formatJobPostingsSummary(0, 'CLOSED', 'zzz')).toBe(
      'No closed postings match “zzz”.',
    );
  });
});

describe('page size', () => {
  it('matches every other table in the portal', () => {
    expect(JOB_POSTINGS_PAGE_SIZE).toBe(20);
  });
});
