import { describe, expect, it } from 'vitest';
import {
  BROADCAST_CATEGORY_LABEL,
  BROADCAST_RECIPIENT_STATUS_LABEL,
  BROADCAST_SEGMENT_LABEL,
  BROADCAST_STATUS_LABEL,
  BROADCAST_TABS,
  BROADCAST_TAB_LABEL,
  DEFAULT_BROADCAST_TAB,
  broadcastDetailHref,
  broadcastsHref,
  canCancel,
  describeInAppReach,
  describeReach,
  formatBroadcastsSummary,
  formatChannels,
  formatDeliverySummary,
  isEditable,
  isInFlight,
  parseBroadcastTab,
  tabToApiStatus,
} from './format';

describe('label maps', () => {
  it('cover every enum member, so a new one is a compile error not raw SCREAMING_SNAKE', () => {
    // The maps are typed Record<PrismaEnum, string>; these assertions pin the
    // key SETS so a member that is added AND labelled badly still shows up.
    expect(Object.keys(BROADCAST_STATUS_LABEL).sort()).toEqual([
      'CANCELLED',
      'DRAFT',
      'FAILED',
      'SENDING',
      'SENT',
    ]);
    expect(Object.keys(BROADCAST_SEGMENT_LABEL).sort()).toEqual([
      'ALL_CANDIDATES',
      'ALL_RECRUITERS',
      'ALL_USERS',
    ]);
    expect(Object.keys(BROADCAST_CATEGORY_LABEL).sort()).toEqual(['OPERATIONAL', 'PROMOTIONAL']);
    expect(Object.keys(BROADCAST_RECIPIENT_STATUS_LABEL).sort()).toEqual([
      'FAILED',
      'PENDING',
      'SENT',
      'SKIPPED',
    ]);
  });

  it('never renders a raw enum value to staff', () => {
    for (const label of [
      ...Object.values(BROADCAST_STATUS_LABEL),
      ...Object.values(BROADCAST_SEGMENT_LABEL),
      ...Object.values(BROADCAST_CATEGORY_LABEL),
      ...Object.values(BROADCAST_RECIPIENT_STATUS_LABEL),
    ]) {
      expect(label).not.toMatch(/^[A-Z_]+$/);
    }
  });

  it('segment labels say what the segment RESOLVES to, not what it is called', () => {
    // "All recruiters" would be a small lie: deactivated recruiters are excluded
    // by broadcastEmailWhere, and an admin comparing this count against the
    // dashboard's recruiter figure needs to know why the two differ.
    expect(BROADCAST_SEGMENT_LABEL.ALL_RECRUITERS).toContain('active');
    expect(BROADCAST_SEGMENT_LABEL.ALL_USERS).toContain('active');
  });

  it('every tab has a label', () => {
    for (const tab of BROADCAST_TABS) {
      expect(BROADCAST_TAB_LABEL[tab]).toBeTruthy();
    }
  });
});

describe('parseBroadcastTab', () => {
  it('defaults to ALL — this console is a log, not a queue', () => {
    // Support lands on OPEN because it is a queue of unworked items. A draft is
    // waiting on nobody but its author, so landing on a filtered view here would
    // hide the history that is the reason to open the page.
    expect(DEFAULT_BROADCAST_TAB).toBe('ALL');
    expect(parseBroadcastTab(undefined)).toBe('ALL');
    expect(parseBroadcastTab('nonsense')).toBe('ALL');
  });

  it('accepts a known tab case-insensitively', () => {
    expect(parseBroadcastTab('sent')).toBe('SENT');
    expect(parseBroadcastTab('  Draft  ')).toBe('DRAFT');
  });

  it('survives a REPEATED query key arriving as an array', () => {
    // Next delivers `?status=a&status=b` as an array. Typing it as a bare string
    // is what let an array reach `raw.trim()` and 500 the /candidates route.
    expect(parseBroadcastTab(['SENT', 'DRAFT'])).toBe('SENT');
    expect(parseBroadcastTab([])).toBe('ALL');
  });

  it('does not resolve __proto__ through the prototype chain', () => {
    // Membership against the TUPLE, never `MAP[raw]` — indexing a plain object
    // with '__proto__' returns a truthy inherited value and would sail through
    // an `if (MAP[raw])` check. That class of bug shipped once on the SRP.
    expect(parseBroadcastTab('__proto__')).toBe('ALL');
    expect(parseBroadcastTab('constructor')).toBe('ALL');
    expect(parseBroadcastTab('toString')).toBe('ALL');
  });
});

describe('tabToApiStatus', () => {
  it('translates ALL to NO status param', () => {
    // The API DTO is .strict() with no ALL member, so sending it verbatim is a
    // 400 — an error state on the one tab that should always work.
    expect(tabToApiStatus('ALL')).toBeUndefined();
    expect(tabToApiStatus('SENT')).toBe('SENT');
  });
});

describe('href builders', () => {
  it('omit defaults so /broadcasts and ?status=ALL&page=1 are the same URL', () => {
    expect(broadcastsHref('ALL', 1)).toBe('/broadcasts');
    expect(broadcastDetailHref(7, 'ALL', 1)).toBe('/broadcasts/7');
  });

  it('carry the active search across a tab change, so a tab narrows rather than resets', () => {
    expect(broadcastsHref('SENT', 1, 'maintenance')).toBe(
      '/broadcasts?status=SENT&q=maintenance',
    );
  });

  it('emit params in a fixed order', () => {
    expect(broadcastsHref('FAILED', 3, 'x')).toBe('/broadcasts?status=FAILED&q=x&page=3');
  });

  it('encode a search term that would otherwise truncate the URL', () => {
    // "R&D" unencoded would end the q param at the ampersand and silently search
    // for "R"; a '#' would drop everything after it.
    expect(broadcastsHref('ALL', 1, 'R&D')).toBe('/broadcasts?q=R%26D');
    expect(broadcastsHref('ALL', 1, 'a#b')).toBe('/broadcasts?q=a%23b');
  });

  it('are basePath-RELATIVE — Next adds /sadmin itself', () => {
    // '/sadmin/broadcasts' here would resolve to /sadmin/sadmin/broadcasts.
    expect(broadcastsHref('ALL', 1).startsWith('/sadmin')).toBe(false);
    expect(broadcastDetailHref(1, 'ALL', 1).startsWith('/sadmin')).toBe(false);
  });

  it('round-trip the list state through the detail link', () => {
    const href = broadcastDetailHref(9, 'SENT', 2, 'maintenance');
    expect(href).toBe('/broadcasts/9?status=SENT&q=maintenance&page=2');
    const params = new URLSearchParams(href.split('?')[1]);
    expect(parseBroadcastTab(params.get('status') ?? undefined)).toBe('SENT');
  });
});

describe('describeInAppReach', () => {
  it('says nothing when in-app is off', () => {
    expect(describeInAppReach('ALL_USERS', false)).toBeNull();
  });

  it('tells the admin in-app CANNOT reach job seekers', () => {
    // apps/web has no bell, no feed and no read of the Notification table, so a
    // candidate row would be written and rendered nowhere.
    const msg = describeInAppReach('ALL_CANDIDATES', true);
    expect(msg).toContain('cannot reach job seekers');
  });

  it('warns that an Everyone broadcast reaches recruiters only in-app', () => {
    // The failure this prevents is undiscoverable: the send reports success, the
    // rows exist, and the only evidence is that nobody on the seeker side ever
    // mentions it.
    const msg = describeInAppReach('ALL_USERS', true) ?? '';
    expect(msg).toContain('recruiters only');
    // Case-insensitive: the sentence names seekers mid-copy, and pinning the
    // capitalisation would fail on a rewording that still said the right thing.
    expect(msg.toLowerCase()).toContain('job seekers');
  });

  it('is plain and unalarming for a recruiter-only broadcast', () => {
    expect(describeInAppReach('ALL_RECRUITERS', true)).toContain('notification bell');
  });
});

describe('describeReach', () => {
  const counts = { emailRecipients: 5000, inAppRecipients: 800 };

  it('does NOT claim in-app delivery when the in-app channel is off', () => {
    // The composer's default state has in-app UNCHECKED. Built from the segment
    // alone, this sentence claimed the message would also reach 800 people in
    // the recruiter portal — an outright false statement in the form's most
    // common configuration, about the one number an admin acts on.
    const s = describeReach(counts, true, false);
    expect(s).toContain('5,000 by email');
    expect(s).not.toContain('recruiter portal');
    expect(s).not.toContain('800');
  });

  it('does NOT claim email delivery when Email is unchecked', () => {
    const s = describeReach(counts, false, true);
    expect(s).not.toContain('by email');
    expect(s).toContain('800 in the recruiter portal');
  });

  it('names both channels when both are on', () => {
    expect(describeReach(counts, true, true)).toBe(
      'Reaches about 5,000 by email, and 800 in the recruiter portal.',
    );
  });

  it('omits an in-app clause that would read "0 people"', () => {
    // A candidate segment has no in-app audience at all; the composer renders a
    // dedicated explanation for that combination rather than a zero aside.
    const s = describeReach({ emailRecipients: 5000, inAppRecipients: 0 }, true, true);
    expect(s).toBe('Reaches about 5,000 by email.');
  });

  it('asks for a channel rather than reporting a reach of nothing', () => {
    expect(describeReach(counts, false, false)).toContain('Choose a channel');
  });
});

describe('formatChannels', () => {
  it('names the live channels', () => {
    expect(formatChannels(true, true)).toBe('Email and in-app');
    expect(formatChannels(true, false)).toBe('Email');
    expect(formatChannels(false, true)).toBe('In-app');
  });

  it('renders an em dash rather than an empty cell for an impossible row', () => {
    expect(formatChannels(false, false)).toBe('—');
  });
});

describe('formatDeliverySummary', () => {
  it('reports only the sent count when nothing went wrong', () => {
    expect(formatDeliverySummary({ sent: 4182, skipped: 0, failed: 0 })).toBe('4,182 sent');
  });

  it('groups digits the Indian way, like every other count in this portal', () => {
    expect(formatDeliverySummary({ sent: 1200000, skipped: 0, failed: 0 })).toBe(
      '12,00,000 sent',
    );
  });

  it('names skipped and failed SEPARATELY rather than as one "not delivered"', () => {
    // A SKIPPED recipient is an account that no longer exists (nothing to fix);
    // a FAILED one is an address the provider rejected (worth looking at).
    expect(formatDeliverySummary({ sent: 10, skipped: 2, failed: 3 })).toBe(
      '10 sent · 2 skipped · 3 failed',
    );
  });

  it('shows the queue backlog while a send is in flight', () => {
    expect(formatDeliverySummary({ sent: 10, skipped: 0, failed: 0, pending: 90 })).toBe(
      '10 sent · 90 still queued',
    );
  });
});

describe('formatBroadcastsSummary', () => {
  it('counts, with Indian digit grouping', () => {
    expect(formatBroadcastsSummary(1, 'ALL')).toBe('1 broadcast');
    expect(formatBroadcastsSummary(12000, 'ALL')).toBe('12,000 broadcasts');
  });

  it('never claims "none ever" when the view is filtered', () => {
    // A bare "nothing here" on the Failed tab reads as "nothing has ever
    // failed", when it means "nothing failed among what you filtered to".
    expect(formatBroadcastsSummary(0, 'ALL')).toContain('No broadcasts yet');
    expect(formatBroadcastsSummary(0, 'FAILED')).toBe('There are no failed broadcasts.');
    expect(formatBroadcastsSummary(0, 'SENT')).toBe('There are no sent broadcasts.');
  });

  it('names the search term in the empty case, so staff know what narrowed it', () => {
    expect(formatBroadcastsSummary(0, 'ALL', 'maintenance')).toBe(
      'No broadcasts match “maintenance”.',
    );
    expect(formatBroadcastsSummary(0, 'SENT', 'x')).toBe('No broadcasts match “x”.');
  });

  it('qualifies a filtered count with the tab it was counted on', () => {
    expect(formatBroadcastsSummary(3, 'SENT')).toBe('3 broadcasts — sent');
    expect(formatBroadcastsSummary(3, 'SENT', 'x')).toBe('3 broadcasts — sent, matching “x”');
  });
});

describe('state predicates', () => {
  it('only a draft is editable', () => {
    expect(isEditable('DRAFT')).toBe(true);
    for (const s of ['SENDING', 'SENT', 'CANCELLED', 'FAILED'] as const) {
      expect(isEditable(s)).toBe(false);
    }
  });

  it('a draft can be abandoned and a live send can be stopped — nothing else', () => {
    expect(canCancel('DRAFT')).toBe(true);
    expect(canCancel('SENDING')).toBe(true);
    for (const s of ['SENT', 'CANCELLED', 'FAILED'] as const) {
      expect(canCancel(s)).toBe(false);
    }
  });

  it('only SENDING has moving numbers', () => {
    expect(isInFlight('SENDING')).toBe(true);
    expect(isInFlight('SENT')).toBe(false);
  });
});
