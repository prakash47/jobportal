import { describe, expect, it } from 'vitest';
import type { SupportTicketCategory, SupportTicketStatus } from '@jobportal/db';
import {
  DEFAULT_SUPPORT_TAB,
  SUPPORT_CATEGORY_LABEL,
  SUPPORT_STATUS_LABEL,
  SUPPORT_TABS,
  SUPPORT_TAB_LABEL,
  canReply,
  contactMessagesHref,
  formatNoteAuthor,
  formatNotesSummary,
  formatSupportCategory,
  formatSupportStatus,
  formatTicketsSummary,
  isOpenTicket,
  parseSupportTab,
  supportHref,
  tabToApiStatus,
  ticketDetailHref,
} from './format';

describe('parseSupportTab', () => {
  it('accepts every known tab', () => {
    for (const tab of SUPPORT_TABS) expect(parseSupportTab(tab)).toBe(tab);
  });

  it('is case-insensitive and trims', () => {
    expect(parseSupportTab('  in_progress ')).toBe('IN_PROGRESS');
  });

  it('falls back to OPEN for absent, empty or unknown input', () => {
    expect(parseSupportTab(undefined)).toBe('OPEN');
    expect(parseSupportTab('')).toBe('OPEN');
    expect(parseSupportTab('PENDING')).toBe('OPEN');
  });

  // A repeated key (?status=a&status=b) arrives as an ARRAY. Typing this as a
  // bare string is what let an array reach `.trim()` and 500 /candidates.
  it('takes the first value when the param repeats', () => {
    expect(parseSupportTab(['RESOLVED', 'OPEN'])).toBe('RESOLVED');
    expect(parseSupportTab([])).toBe('OPEN');
  });

  // The prototype-chain class this repo has already shipped a HIGH for. A
  // membership check against the tuple is what makes these safe; an
  // `if (MAP[raw])` would return a truthy inherited function for each one.
  it('does not resolve prototype keys', () => {
    expect(parseSupportTab('__proto__')).toBe('OPEN');
    expect(parseSupportTab('constructor')).toBe('OPEN');
    expect(parseSupportTab('toString')).toBe('OPEN');
    expect(parseSupportTab('hasOwnProperty')).toBe('OPEN');
  });
});

describe('tabToApiStatus', () => {
  // 'ALL' is a UI concept. The API DTO is .strict() with no ALL member, so
  // forwarding it verbatim is a 400 on the one tab that must always work.
  it('maps ALL to undefined so no status param is sent', () => {
    expect(tabToApiStatus('ALL')).toBeUndefined();
  });

  it('passes real statuses through unchanged', () => {
    expect(tabToApiStatus('OPEN')).toBe('OPEN');
    expect(tabToApiStatus('IN_PROGRESS')).toBe('IN_PROGRESS');
    expect(tabToApiStatus('RESOLVED')).toBe('RESOLVED');
    expect(tabToApiStatus('CLOSED')).toBe('CLOSED');
  });

  // Every tab except ALL must be a real SupportTicketStatus, or the API 400s.
  it('every non-ALL tab is a valid status label', () => {
    for (const tab of SUPPORT_TABS) {
      if (tab === 'ALL') continue;
      expect(SUPPORT_STATUS_LABEL[tab as SupportTicketStatus]).toBeTypeOf('string');
    }
  });
});

describe('labels', () => {
  // Pins the FULL key set. A new SupportTicketStatus/Category member must be a
  // compile error here rather than raw SCREAMING_SNAKE in front of staff — the
  // failure mode the shipped /admin console's Record<string,string> allows.
  it('covers every SupportTicketStatus', () => {
    const expected: Record<SupportTicketStatus, string> = {
      OPEN: 'Open',
      IN_PROGRESS: 'In progress',
      RESOLVED: 'Resolved',
      CLOSED: 'Closed',
    };
    expect(SUPPORT_STATUS_LABEL).toEqual(expected);
  });

  it('covers every SupportTicketCategory', () => {
    const expected: Record<SupportTicketCategory, string> = {
      ACCOUNT: 'Account',
      JOB_POSTING: 'Job posting',
      APPLICANTS: 'Applicants',
      VERIFICATION: 'Verification',
      BILLING: 'Billing',
      TECHNICAL: 'Technical',
      OTHER: 'Other',
    };
    expect(SUPPORT_CATEGORY_LABEL).toEqual(expected);
  });

  it('tab labels cover every tab including ALL', () => {
    for (const tab of SUPPORT_TABS) expect(SUPPORT_TAB_LABEL[tab]).toBeTruthy();
    expect(SUPPORT_TAB_LABEL.ALL).toBe('All');
  });

  it('formatters read from the maps', () => {
    expect(formatSupportStatus('IN_PROGRESS')).toBe('In progress');
    expect(formatSupportCategory('JOB_POSTING')).toBe('Job posting');
  });

  // CLOSED must remain a tab: recruiters can close their own tickets, so they
  // arrive in that state with no staff action. Dropping the tab would strand
  // them somewhere no console could reach.
  it('keeps CLOSED as a reachable tab', () => {
    expect(SUPPORT_TABS).toContain('CLOSED');
    expect(parseSupportTab('CLOSED')).toBe('CLOSED');
  });
});

describe('isOpenTicket', () => {
  it('counts OPEN and IN_PROGRESS as needing work', () => {
    expect(isOpenTicket('OPEN')).toBe(true);
    expect(isOpenTicket('IN_PROGRESS')).toBe(true);
  });

  it('does not count RESOLVED or CLOSED', () => {
    expect(isOpenTicket('RESOLVED')).toBe(false);
    expect(isOpenTicket('CLOSED')).toBe(false);
  });
});

describe('canReply', () => {
  // Mirrors the API's 409. CLOSED blocks replies ONLY — not status changes and
  // not notes.
  it('is false only for CLOSED', () => {
    expect(canReply('CLOSED')).toBe(false);
    expect(canReply('OPEN')).toBe(true);
    expect(canReply('IN_PROGRESS')).toBe(true);
    expect(canReply('RESOLVED')).toBe(true);
  });
});

describe('supportHref', () => {
  it('omits the default tab and page 1', () => {
    expect(supportHref('OPEN', 1)).toBe('/support');
  });

  it('emits a non-default tab', () => {
    expect(supportHref('RESOLVED', 1)).toBe('/support?status=RESOLVED');
  });

  // The whole reason one builder is shared by tabs, pagination and the
  // over-range redirect: a tab click must narrow the current view rather than
  // wiping the admin's active search.
  it('carries the search across a tab change', () => {
    expect(supportHref('CLOSED', 1, 'acme')).toBe('/support?status=CLOSED&q=acme');
  });

  it('carries search and page together in a fixed order', () => {
    expect(supportHref('ALL', 3, 'acme')).toBe('/support?status=ALL&q=acme&page=3');
  });

  it('encodes a query that would otherwise break the URL', () => {
    expect(supportHref('OPEN', 1, 'R&D #2')).toBe('/support?q=R%26D+%232');
  });

  // basePath-relative. Writing '/sadmin/support' resolves to /sadmin/sadmin/...
  it('is basePath-relative', () => {
    expect(supportHref('OPEN', 2)).not.toContain('/sadmin/');
  });

  it('treats the default tab at page 1 with no q as the canonical URL', () => {
    expect(supportHref(DEFAULT_SUPPORT_TAB, 1, undefined)).toBe('/support');
  });
});

describe('ticketDetailHref', () => {
  it('is bare when the list is in its default state', () => {
    expect(ticketDetailHref(12, 'OPEN', 1)).toBe('/support/12');
  });

  // Carries the three params rather than a ?from= URL — a free-form return URL
  // off the query string is an open-redirect surface.
  it('carries the list state so Back returns to the same filtered page', () => {
    expect(ticketDetailHref(12, 'RESOLVED', 2, 'acme')).toBe(
      '/support/12?status=RESOLVED&q=acme&page=2',
    );
  });

  it('encodes the carried query', () => {
    expect(ticketDetailHref(1, 'OPEN', 1, 'a&b')).toBe('/support/1?q=a%26b');
  });
});

describe('contactMessagesHref', () => {
  it('omits page 1', () => {
    expect(contactMessagesHref(1)).toBe('/support/messages');
    expect(contactMessagesHref(2)).toBe('/support/messages?page=2');
  });
});

describe('formatTicketsSummary', () => {
  it('counts with the right noun and pluralisation', () => {
    expect(formatTicketsSummary(1, 'OPEN')).toBe('1 open ticket');
    expect(formatTicketsSummary(2, 'OPEN')).toBe('2 open tickets');
    expect(formatTicketsSummary(1, 'IN_PROGRESS')).toBe('1 ticket in progress');
    expect(formatTicketsSummary(3, 'IN_PROGRESS')).toBe('3 tickets in progress');
  });

  it('uses the Indian digit grouping', () => {
    expect(formatTicketsSummary(100000, 'ALL')).toBe('1,00,000 tickets');
  });

  it('names the search when one is active', () => {
    expect(formatTicketsSummary(2, 'OPEN', 'acme')).toBe('2 open tickets matching “acme”');
    expect(formatTicketsSummary(0, 'OPEN', 'acme')).toBe('No open tickets match “acme”.');
  });

  // The empty copy must never claim more than it knows. OPEN is the LANDING tab,
  // so a bare "no tickets" there would tell a staff member support is broken
  // when the queue is merely drained.
  it('scopes the empty message to the filtered tab', () => {
    expect(formatTicketsSummary(0, 'OPEN')).toBe('There are no open tickets right now.');
    expect(formatTicketsSummary(0, 'CLOSED')).toBe('There are no closed tickets right now.');
  });

  it('only claims "none have been raised" on the unfiltered ALL tab', () => {
    expect(formatTicketsSummary(0, 'ALL')).toBe('No tickets have been raised yet.');
  });
});

describe('formatNoteAuthor', () => {
  it('prefers the name', () => {
    expect(formatNoteAuthor({ name: 'Asha', email: 'a@x.com' })).toBe('Asha');
  });

  it('falls back to the email when the name is blank or whitespace', () => {
    expect(formatNoteAuthor({ name: '', email: 'a@x.com' })).toBe('a@x.com');
    expect(formatNoteAuthor({ name: '   ', email: 'a@x.com' })).toBe('a@x.com');
  });

  // The note deliberately outlives the admin account that wrote it (authorId is
  // a loose id, no FK). Reads as a phrase, not an em dash, so it is not mistaken
  // for "no author recorded".
  it('names a deleted admin account rather than rendering blank', () => {
    expect(formatNoteAuthor(null)).toBe('Unknown admin');
  });
});

describe('formatNotesSummary', () => {
  // The staff-only promise must be present on EVERY render including the empty
  // one — the risk this feature carries is a note written into the reply box, so
  // the audience has to be stated at the moment of writing.
  it('states the audience even when there are no notes', () => {
    expect(formatNotesSummary(0)).toContain('staff only');
    expect(formatNotesSummary(1)).toContain('staff only');
    expect(formatNotesSummary(5)).toContain('staff only');
  });

  it('pluralises and groups', () => {
    expect(formatNotesSummary(1)).toBe('1 internal note. Visible to staff only.');
    expect(formatNotesSummary(2)).toBe('2 internal notes. Visible to staff only.');
  });
});
