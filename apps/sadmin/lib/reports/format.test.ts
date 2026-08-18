import { describe, expect, it } from 'vitest';
import {
  DEFAULT_REPORT_TAB,
  REPORT_REASON_LABEL,
  REPORT_STATUS_LABEL,
  REPORT_TABS,
  canTakeDownJob,
  formatOtherOpenReports,
  formatReporter,
  formatReportReason,
  formatReportStatus,
  formatReportsSummary,
  isOpenReport,
  parseReportTab,
  reportDetailHref,
  reportsHref,
  takedownBlockedReason,
} from './format';

describe('parseReportTab', () => {
  it('defaults to OPEN — the queue exists to be worked', () => {
    expect(DEFAULT_REPORT_TAB).toBe('OPEN');
    expect(parseReportTab(undefined)).toBe('OPEN');
    expect(parseReportTab('')).toBe('OPEN');
  });

  it('accepts every declared tab, case-insensitively', () => {
    for (const tab of REPORT_TABS) {
      expect(parseReportTab(tab)).toBe(tab);
      expect(parseReportTab(tab.toLowerCase())).toBe(tab);
    }
    expect(parseReportTab('  dismissed  ')).toBe('DISMISSED');
  });

  it('collapses a repeated key to its first value', () => {
    // `?status=a&status=b` arrives as an ARRAY. Reaching .trim() on one is a
    // real 500 this repo has already taken on /candidates.
    expect(parseReportTab(['ACTIONED', 'OPEN'])).toBe('ACTIONED');
    expect(parseReportTab([])).toBe('OPEN');
  });

  it('falls back rather than 400ing on an unknown value', () => {
    expect(parseReportTab('ESCALATED')).toBe('OPEN');
    expect(parseReportTab('whatever')).toBe('OPEN');
  });

  // Membership against a tuple, never `MAP[raw]`. Indexing a plain object with
  // these returns a truthy inherited value and sails through an `if (MAP[raw])`
  // check — the prototype-chain class already shipped once on the SRP.
  it.each(['__proto__', 'constructor', 'toString', 'valueOf', 'hasOwnProperty'])(
    'does not resolve %s through the prototype chain',
    (key) => {
      expect(parseReportTab(key)).toBe('OPEN');
    },
  );
});

describe('reportsHref', () => {
  it('omits defaults so the canonical URL is clean', () => {
    expect(reportsHref('OPEN', 1)).toBe('/reports');
    expect(reportsHref('OPEN', 1, undefined)).toBe('/reports');
  });

  it('emits status, q and page in a fixed order', () => {
    expect(reportsHref('ACTIONED', 3, 'acme')).toBe('/reports?status=ACTIONED&q=acme&page=3');
  });

  it('carries the search across a tab change', () => {
    // The whole reason this builder exists: clicking a tab must narrow the
    // current view, never silently wipe the admin's active search.
    expect(reportsHref('DISMISSED', 1, 'acme corp')).toBe(
      '/reports?status=DISMISSED&q=acme+corp',
    );
  });

  it('is basePath-relative', () => {
    // Next prefixes '/sadmin' itself; '/sadmin/reports' would resolve to
    // /sadmin/sadmin/reports.
    expect(reportsHref('OPEN', 2)).not.toContain('/sadmin');
  });

  it('percent-encodes a query that would otherwise break the URL', () => {
    expect(reportsHref('OPEN', 1, 'a&b=c')).toBe('/reports?q=a%26b%3Dc');
  });
});

describe('reportDetailHref', () => {
  it('round-trips the list state so Back returns to the same page', () => {
    expect(reportDetailHref(9, 'REVIEWING', 4, 'acme')).toBe(
      '/reports/9?status=REVIEWING&q=acme&page=4',
    );
    expect(reportDetailHref(9, 'OPEN', 1)).toBe('/reports/9');
  });
});

describe('formatReportsSummary', () => {
  it('counts with an en-IN grouped number', () => {
    expect(formatReportsSummary(1, 'OPEN')).toBe('1 open report');
    expect(formatReportsSummary(2, 'OPEN')).toBe('2 open reports');
    expect(formatReportsSummary(12_34_567, 'ALL')).toBe('12,34,567 reports');
  });

  it('names the search when one is active', () => {
    expect(formatReportsSummary(3, 'ALL', 'acme')).toBe('3 reports matching “acme”');
    expect(formatReportsSummary(0, 'ALL', 'acme')).toBe('No reports match “acme”.');
  });

  // The empty copy must never over-claim. OPEN is the LANDING tab, so a bare
  // "no reports" there would tell an admin the feature is broken when in fact
  // the queue is merely clear.
  it('only claims nothing has ever been filed on the unfiltered tab', () => {
    expect(formatReportsSummary(0, 'ALL')).toBe('No reports have been filed yet.');
    expect(formatReportsSummary(0, 'OPEN')).toBe('There are no open reports right now.');
    expect(formatReportsSummary(0, 'REVIEWING')).toBe('There are no reports in review right now.');
    expect(formatReportsSummary(0, 'ACTIONED')).toBe('There are no upheld reports right now.');
  });

  it('reads as English on every tab', () => {
    for (const tab of REPORT_TABS) {
      expect(formatReportsSummary(0, tab)).toMatch(/\.$/);
      expect(formatReportsSummary(1, tab)).not.toContain('undefined');
    }
  });
});

describe('labels', () => {
  // ACTIONED reads as "Upheld": the enum records a JUDGEMENT, and "Actioned" is
  // process jargon that says something happened without saying which way.
  it('names a decision, not a process step', () => {
    expect(formatReportStatus('ACTIONED')).toBe('Upheld');
    expect(formatReportStatus('DISMISSED')).toBe('Dismissed');
  });

  it('covers every status and reason exactly', () => {
    // Keyed by the Prisma enum, so a new member is a compile error rather than a
    // raw SCREAMING_SNAKE string in front of a moderator. These assertions catch
    // the other direction: a member quietly REMOVED from the map.
    expect(Object.keys(REPORT_STATUS_LABEL).sort()).toEqual([
      'ACTIONED',
      'DISMISSED',
      'OPEN',
      'REVIEWING',
    ]);
    expect(Object.keys(REPORT_REASON_LABEL).sort()).toEqual([
      'DISCRIMINATORY',
      'DUPLICATE',
      'FAKE_OR_SCAM',
      'MISLEADING',
      'OFFENSIVE',
      'OTHER',
    ]);
  });

  // ⚠ Verbatim the options apps/web shows the reporter. A console that
  // paraphrases discards the part that tells a moderator where to look.
  it('reproduces the reporter-facing wording exactly', () => {
    expect(formatReportReason('FAKE_OR_SCAM')).toBe('Fake or scam listing');
    expect(formatReportReason('MISLEADING')).toBe('Misleading details (salary, role or location)');
    expect(formatReportReason('OTHER')).toBe('Something else');
  });
});

describe('isOpenReport', () => {
  it('is true only for the two non-terminal states', () => {
    expect(isOpenReport('OPEN')).toBe(true);
    expect(isOpenReport('REVIEWING')).toBe(true);
    expect(isOpenReport('ACTIONED')).toBe(false);
    expect(isOpenReport('DISMISSED')).toBe(false);
  });
});

describe('takedown eligibility', () => {
  it('offers a takedown only for a live posting', () => {
    expect(canTakeDownJob({ status: 'ACTIVE' })).toBe(true);
    expect(takedownBlockedReason({ status: 'ACTIVE' })).toBeNull();
  });

  it.each([
    ['CLOSED', 'this posting is already closed'],
    ['EXPIRED', 'this posting has already expired'],
    ['DRAFT', 'this posting is not live'],
    ['PENDING_MODERATION', 'this posting is not live'],
  ] as const)('refuses a %s posting and says why', (status, reason) => {
    expect(canTakeDownJob({ status })).toBe(false);
    expect(takedownBlockedReason({ status })).toBe(reason);
  });

  it('handles a report with no posting', () => {
    // ContentReport.jobId is nullable so a second target type stays additive.
    expect(canTakeDownJob(null)).toBe(false);
    expect(takedownBlockedReason(null)).toBe('this report does not name a posting');
  });
});

describe('formatReporter', () => {
  // Anonymous is the COMMON case — /job/[slug] is public and mostly logged-out,
  // and intake deliberately accepts unattributed reports. It reads as a word
  // rather than an em dash so it cannot be mistaken for missing data.
  it('names anonymity rather than showing a gap', () => {
    expect(formatReporter(null)).toBe('Anonymous');
  });

  it('prefers the name and falls back to the email', () => {
    expect(formatReporter({ name: 'Priya Sharma', email: 'p@x.com' })).toBe('Priya Sharma');
    expect(formatReporter({ name: '', email: 'p@x.com' })).toBe('p@x.com');
    // Whitespace-only names render as a blank cell if not folded — a bug the
    // candidate console shipped and had to fix.
    expect(formatReporter({ name: '   ', email: 'p@x.com' })).toBe('p@x.com');
  });
});

describe('formatOtherOpenReports', () => {
  // A posting reported forty times must read as one problem, not forty. This is
  // what @@index([jobId, status]) was added for.
  it('says nothing when this is the only open report', () => {
    expect(formatOtherOpenReports(0)).toBeNull();
    expect(formatOtherOpenReports(-1)).toBeNull();
  });

  it('counts the others, singular and plural', () => {
    expect(formatOtherOpenReports(1)).toBe('1 other open report names this posting.');
    expect(formatOtherOpenReports(4)).toBe('4 other open reports name this posting.');
  });
});
