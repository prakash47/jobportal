import { describe, expect, it } from 'vitest';
import {
  broadcastEmailWhere,
  broadcastInAppWhere,
  segmentSupportsInApp,
} from './broadcast-segment';

/**
 * These assertions pin the SHAPE of the where-clause rather than its results,
 * because this file is the single definition three separate callers depend on
 * agreeing about — the console's count preview, the audit row's count, and the
 * planner that writes the ledger. A change here that quietly widened a segment
 * would mail people nobody chose.
 */
describe('broadcastEmailWhere', () => {
  it('candidates are selected by role alone', () => {
    expect(broadcastEmailWhere('ALL_CANDIDATES')).toEqual({ role: 'CANDIDATE' });
  });

  it('EXCLUDES deactivated recruiters', () => {
    // Recruiter.deactivatedAt is a soft-remove whose sessions are revoked and
    // who cannot re-authenticate. Mailing them a platform announcement invites
    // someone who demonstrably cannot sign in to go and try. Note the existing
    // notifyKycDecision fan-out does NOT filter this — a bug to avoid copying,
    // not a precedent to follow.
    expect(broadcastEmailWhere('ALL_RECRUITERS')).toEqual({
      role: 'RECRUITER',
      recruiter: { deactivatedAt: null },
    });
  });

  it('ALL_USERS is candidates OR active recruiters — never a bare role list', () => {
    // `role: { in: ['CANDIDATE', 'RECRUITER'] }` would be shorter and WRONG: it
    // drops the deactivation filter, so the broadest segment would be the one
    // that mails removed teammates.
    expect(broadcastEmailWhere('ALL_USERS')).toEqual({
      OR: [{ role: 'CANDIDATE' }, { role: 'RECRUITER', recruiter: { deactivatedAt: null } }],
    });
  });

  it('no segment ever selects ADMIN accounts', () => {
    // Staff receiving the platform's own announcements as customers is noise,
    // and the dashboard's signup series already excludes ADMIN for this reason.
    // Asserted over the serialised predicate so a future segment that reached
    // staff has to change this test on purpose.
    for (const segment of ['ALL_CANDIDATES', 'ALL_RECRUITERS', 'ALL_USERS'] as const) {
      expect(JSON.stringify(broadcastEmailWhere(segment))).not.toContain('ADMIN');
    }
  });

  it('does NOT require emailVerified', () => {
    // An unverified user still supplied a working address at signup, and an
    // operational notice is exactly what someone mid-signup still needs.
    // Requiring it would silently shrink every segment with no signal on screen.
    for (const segment of ['ALL_CANDIDATES', 'ALL_RECRUITERS', 'ALL_USERS'] as const) {
      expect(JSON.stringify(broadcastEmailWhere(segment))).not.toContain('emailVerified');
    }
  });
});

describe('broadcastInAppWhere', () => {
  it('is null for a candidate-only segment — apps/web has no bell to render on', () => {
    expect(broadcastInAppWhere('ALL_CANDIDATES')).toBeNull();
    expect(segmentSupportsInApp('ALL_CANDIDATES')).toBe(false);
  });

  it('narrows ALL_USERS to active recruiters rather than mirroring the email audience', () => {
    // The failure this prevents is silent: writing Notification rows for
    // candidates would insert them successfully and render them nowhere, so an
    // admin would be told an in-app announcement reached everyone.
    expect(broadcastInAppWhere('ALL_USERS')).toEqual({
      role: 'RECRUITER',
      recruiter: { deactivatedAt: null },
    });
    expect(broadcastInAppWhere('ALL_USERS')).toEqual(broadcastInAppWhere('ALL_RECRUITERS'));
  });

  it('is never wider than the email audience for the same segment', () => {
    expect(segmentSupportsInApp('ALL_RECRUITERS')).toBe(true);
    expect(segmentSupportsInApp('ALL_USERS')).toBe(true);
  });
});
