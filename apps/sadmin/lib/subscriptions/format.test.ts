import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SUBSCRIPTION_TAB,
  SUBSCRIPTION_STATE_LABEL,
  SUBSCRIPTION_TABS,
  daysUntil,
  deriveSubscriptionState,
  formatInrFromPaise,
  isAdminGranted,
  parseSubscriptionTab,
  renewalLabel,
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

describe('daysUntil', () => {
  it('counts whole days remaining', () => {
    expect(daysUntil(new Date('2026-08-25T12:00:00.000Z'), NOW)).toBe(10);
  });

  // floor, not ceil: a period ending in 20 hours has 0 whole days left, and ceil
  // would round it up to "1 day" — the same off-by-one fixed on the recruiter
  // job detail page.
  it('floors a partial day rather than rounding it up', () => {
    expect(daysUntil(new Date('2026-08-16T08:00:00.000Z'), NOW)).toBe(0);
  });

  it('goes negative once the period has passed', () => {
    expect(daysUntil(PAST, NOW)).toBe(-31);
  });

  it('never produces -0 for a just-expired period', () => {
    expect(Object.is(daysUntil(new Date(NOW.getTime()), NOW), -0)).toBe(false);
  });
});

describe('renewalLabel', () => {
  // A single "Renews <date>" column on every row would tell staff that a plan
  // which stopped granting access months ago is about to renew — which, with no
  // billing cron in this product, it never will.
  it('only says Renews for a live subscription', () => {
    expect(renewalLabel('ACTIVE')).toBe('Renews');
    expect(renewalLabel('LAPSED')).toBe('Ended');
    expect(renewalLabel('CANCELLED')).toBe('Cancelled');
  });
});
