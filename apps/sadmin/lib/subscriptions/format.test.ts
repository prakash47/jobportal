import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SUBSCRIPTION_TAB,
  SUBSCRIPTION_STATE_LABEL,
  SUBSCRIPTION_TABS,
  daysRemaining,
  daysSince,
  deriveSubscriptionState,
  formatInrFromPaise,
  isAdminGranted,
  parseSubscriptionTab,
  formatSubscriptionsSummary,
  periodLabel,
  pluralDays,
  subscriptionDetailHref,
  subscriptionsHref,
} from './format';

const NOW = new Date('2026-08-15T12:00:00.000Z');
const FUTURE = new Date('2026-09-15T12:00:00.000Z');
const PAST = new Date('2026-07-15T12:00:00.000Z');

describe('deriveSubscriptionState', () => {
  it('is ACTIVE only when the status is live AND the period has not run out', () => {
    expect(deriveSubscriptionState('ACTIVE', FUTURE, NOW)).toBe('ACTIVE');
    expect(deriveSubscriptionState('TRIALING', FUTURE, NOW)).toBe('ACTIVE');
  });

  // THE reason this function exists. Nothing in this product ever writes
  // SubscriptionStatus.EXPIRED — no cron, no queue, no request path — so a plan
  // whose period ended months ago still reads ACTIVE in the database forever.
  // Rendering that column raw would tell staff a dead plan is live, and would
  // disagree with resolveRecruiterTier, which re-checks the date itself.
  it('is LAPSED for a still-ACTIVE row whose period has passed', () => {
    expect(deriveSubscriptionState('ACTIVE', PAST, NOW)).toBe('LAPSED');
    expect(deriveSubscriptionState('TRIALING', PAST, NOW)).toBe('LAPSED');
  });

  it('treats a period ending exactly now as lapsed, matching the resolver’s gt', () => {
    expect(deriveSubscriptionState('ACTIVE', new Date(NOW.getTime()), NOW)).toBe('LAPSED');
  });

  it('is CANCELLED whatever the period says', () => {
    expect(deriveSubscriptionState('CANCELLED', FUTURE, NOW)).toBe('CANCELLED');
    expect(deriveSubscriptionState('CANCELLED', PAST, NOW)).toBe('CANCELLED');
  });

  it('folds the statuses nothing writes into LAPSED', () => {
    expect(deriveSubscriptionState('PAST_DUE', FUTURE, NOW)).toBe('LAPSED');
    expect(deriveSubscriptionState('EXPIRED', FUTURE, NOW)).toBe('LAPSED');
  });

  it('labels every state it can produce', () => {
    for (const state of ['ACTIVE', 'LAPSED', 'CANCELLED'] as const) {
      expect(SUBSCRIPTION_STATE_LABEL[state]).toBeTruthy();
    }
  });
});

describe('parseSubscriptionTab', () => {
  it('accepts every tab, case-insensitively', () => {
    for (const tab of SUBSCRIPTION_TABS) {
      expect(parseSubscriptionTab(tab.toLowerCase())).toBe(tab);
    }
  });

  it('falls back to the default for unknown, missing or malformed input', () => {
    expect(parseSubscriptionTab(undefined)).toBe(DEFAULT_SUBSCRIPTION_TAB);
    expect(parseSubscriptionTab('NOPE')).toBe(DEFAULT_SUBSCRIPTION_TAB);
    expect(parseSubscriptionTab('')).toBe(DEFAULT_SUBSCRIPTION_TAB);
  });

  it('collapses a repeated key to its first value', () => {
    expect(parseSubscriptionTab(['CANCELLED', 'ALL'])).toBe('CANCELLED');
  });

  // Membership against a tuple, never SOME_MAP[raw]: indexing a plain object
  // with '__proto__' or 'toString' returns a truthy inherited value and sails
  // through an `if (MAP[raw])` check — the prototype-chain class this repo
  // already shipped a HIGH for on the SRP.
  it.each(['__proto__', 'toString', 'constructor', 'hasOwnProperty'])(
    'is not fooled by the inherited property %s',
    (evil) => {
      expect(parseSubscriptionTab(evil)).toBe(DEFAULT_SUBSCRIPTION_TAB);
    },
  );
});

describe('subscriptionsHref', () => {
  it('omits defaults so the canonical view is the bare path', () => {
    expect(subscriptionsHref('ACTIVE', 1)).toBe('/subscriptions');
  });

  it('carries the active search across a tab change', () => {
    expect(subscriptionsHref('CANCELLED', 1, 'acme')).toBe('/subscriptions?status=CANCELLED&q=acme');
  });

  it('carries the active search across a page change', () => {
    expect(subscriptionsHref('ACTIVE', 3, 'acme')).toBe('/subscriptions?q=acme&page=3');
  });

  it('encodes a query that would otherwise break the URL', () => {
    expect(subscriptionsHref('ACTIVE', 1, 'a&b=c d')).toBe('/subscriptions?q=a%26b%3Dc+d');
  });

  // Next prefixes '/sadmin' itself — an absolute href here resolves to
  // /sadmin/sadmin/subscriptions.
  it('is basePath-relative', () => {
    expect(subscriptionsHref('ALL', 2, 'x').startsWith('/sadmin')).toBe(false);
    expect(subscriptionDetailHref(9, 'ALL', 2, 'x').startsWith('/sadmin')).toBe(false);
  });

  it('round-trips list state onto the detail link', () => {
    expect(subscriptionDetailHref(9, 'LAPSED', 2, 'acme')).toBe(
      '/subscriptions/9?status=LAPSED&q=acme&page=2',
    );
    expect(subscriptionDetailHref(9, 'ACTIVE', 1)).toBe('/subscriptions/9');
  });
});

describe('isAdminGranted', () => {
  it('is true only for a comped subscription', () => {
    expect(isAdminGranted(new Date())).toBe(true);
    expect(isAdminGranted(null)).toBe(false);
  });
});

describe('formatInrFromPaise', () => {
  it('renders whole rupees without decimals', () => {
    expect(formatInrFromPaise(499900)).toBe('₹4,999');
    expect(formatInrFromPaise(9999900)).toBe('₹99,999');
  });

  it('keeps paise when the amount is not whole rupees', () => {
    expect(formatInrFromPaise(499950)).toBe('₹4,999.50');
  });

  it('renders zero', () => {
    expect(formatInrFromPaise(0)).toBe('₹0');
  });

  // Indian digit grouping (2,2,3), not thousands — ₹10,00,000 not ₹1,000,000.
  it('uses Indian digit grouping', () => {
    expect(formatInrFromPaise(100000000)).toBe('₹10,00,000');
  });
});

describe('daysRemaining', () => {
  it('counts whole days remaining', () => {
    expect(daysRemaining(new Date('2026-08-25T12:00:00.000Z'), NOW)).toBe(10);
  });

  // Math.ceil, copied from apps/recruiter's billing card, which shows the SAME
  // number to the company whose plan this is. An earlier version floored here,
  // so a plan with 30 hours left read "1 day" on one surface and "1 day" on the
  // other only by luck - at 20 hours they disagreed outright.
  it('rounds a partial day UP, matching the recruiter card', () => {
    expect(daysRemaining(new Date('2026-08-16T08:00:00.000Z'), NOW)).toBe(1);
    expect(daysRemaining(new Date('2026-08-16T18:00:00.000Z'), NOW)).toBe(2);
  });

  it('never goes negative once the period has passed', () => {
    expect(daysRemaining(PAST, NOW)).toBe(0);
    expect(daysRemaining(new Date(NOW.getTime()), NOW)).toBe(0);
  });

  it('never produces -0', () => {
    expect(Object.is(daysRemaining(new Date(NOW.getTime()), NOW), -0)).toBe(false);
  });
});

describe('daysSince', () => {
  it('counts whole elapsed days', () => {
    expect(daysSince(PAST, NOW)).toBe(31);
  });

  // Truncates rather than flooring the negative delta. Math.floor rounded AWAY
  // from zero here, so a period that ended one millisecond ago rendered "Ended 1
  // days ago" and the display jumped from "Ends today" to "Ended 1 days ago"
  // across a one-millisecond boundary.
  it('is 0 for a period that has only just ended', () => {
    expect(daysSince(new Date(NOW.getTime() - 1), NOW)).toBe(0);
    expect(daysSince(new Date(NOW.getTime() - 23 * 3600 * 1000), NOW)).toBe(0);
  });

  it('turns over only on a whole day', () => {
    expect(daysSince(new Date(NOW.getTime() - 25 * 3600 * 1000), NOW)).toBe(1);
    expect(daysSince(new Date(NOW.getTime() - 30 * 3600 * 1000), NOW)).toBe(1);
  });

  it('is 0 for a period still in the future', () => {
    expect(daysSince(FUTURE, NOW)).toBe(0);
  });
});

describe('pluralDays', () => {
  it('uses the singular for exactly one day', () => {
    expect(pluralDays(1)).toBe('1 day');
  });

  it('uses the plural otherwise', () => {
    expect(pluralDays(0)).toBe('0 days');
    expect(pluralDays(2)).toBe('2 days');
  });
});

describe('formatSubscriptionsSummary', () => {
  it('pluralises the noun', () => {
    expect(formatSubscriptionsSummary(1, 'ALL')).toContain('1 subscription.');
    expect(formatSubscriptionsSummary(2, 'ALL')).toContain('2 subscriptions.');
  });

  it('names the active tab so the count is not read as platform-wide', () => {
    expect(formatSubscriptionsSummary(3, 'CANCELLED')).toBe('3 cancelled subscriptions.');
    expect(formatSubscriptionsSummary(3, 'ALL')).toBe('3 subscriptions.');
  });

  it('echoes the search term in the empty state', () => {
    expect(formatSubscriptionsSummary(0, 'ACTIVE', 'acme')).toContain('acme');
    expect(formatSubscriptionsSummary(0, 'ACTIVE')).toBe('No active subscriptions yet.');
  });

  it('groups large counts for Indian readers', () => {
    expect(formatSubscriptionsSummary(100000, 'ALL')).toContain('1,00,000');
  });
});

describe('periodLabel', () => {
  // Never "Renews". Nothing in this product auto-renews: no billing cron, no
  // queue, and the purchase flow uses the Razorpay ORDERS api (a one-off charge)
  // rather than the Subscriptions api, which is why razorpaySubscriptionId is
  // null on every row. A column headed "Renews 14 Sept" would promise staff that
  // money arrives on a date when nothing is scheduled to happen.
  it('says Ends for a live subscription, never Renews', () => {
    expect(periodLabel('ACTIVE')).toBe('Ends');
    expect(periodLabel('LAPSED')).toBe('Ended');
    expect(periodLabel('CANCELLED')).toBe('Cancelled');
  });

  it('never uses the word Renews for any state', () => {
    for (const state of ['ACTIVE', 'LAPSED', 'CANCELLED'] as const) {
      expect(periodLabel(state)).not.toMatch(/renew/i);
    }
  });
});
