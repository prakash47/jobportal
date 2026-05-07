import { describe, expect, it } from 'vitest';
import type { ApplicationStatus } from '@jobportal/db';
import { buildHistoryEntry, canTransition, isTerminal } from './state-machine';

describe('isTerminal', () => {
  it.each(['HIRED', 'REJECTED', 'WITHDRAWN'] satisfies ApplicationStatus[])(
    '%s is terminal',
    (s) => expect(isTerminal(s)).toBe(true),
  );

  it.each(['APPLIED', 'IN_REVIEW', 'SHORTLISTED', 'INTERVIEWED', 'OFFERED'] satisfies ApplicationStatus[])(
    '%s is non-terminal',
    (s) => expect(isTerminal(s)).toBe(false),
  );
});

describe('canTransition — CANDIDATE', () => {
  it('lets the candidate WITHDRAW from any non-terminal state', () => {
    for (const s of ['APPLIED', 'IN_REVIEW', 'SHORTLISTED', 'INTERVIEWED', 'OFFERED'] as const) {
      expect(canTransition(s, 'WITHDRAWN', 'CANDIDATE')).toBe(true);
    }
  });

  it('rejects every other candidate-driven transition', () => {
    for (const to of ['IN_REVIEW', 'SHORTLISTED', 'INTERVIEWED', 'OFFERED', 'HIRED', 'REJECTED'] as const) {
      expect(canTransition('APPLIED', to, 'CANDIDATE')).toBe(false);
    }
  });

  it('rejects WITHDRAWN once already terminal', () => {
    for (const s of ['HIRED', 'REJECTED', 'WITHDRAWN'] as const) {
      expect(canTransition(s, 'WITHDRAWN', 'CANDIDATE')).toBe(false);
    }
  });
});

describe('canTransition — RECRUITER', () => {
  it('allows the forward path APPLIED → … → HIRED', () => {
    expect(canTransition('APPLIED', 'IN_REVIEW', 'RECRUITER')).toBe(true);
    expect(canTransition('IN_REVIEW', 'SHORTLISTED', 'RECRUITER')).toBe(true);
    expect(canTransition('SHORTLISTED', 'INTERVIEWED', 'RECRUITER')).toBe(true);
    expect(canTransition('INTERVIEWED', 'OFFERED', 'RECRUITER')).toBe(true);
    expect(canTransition('OFFERED', 'HIRED', 'RECRUITER')).toBe(true);
  });

  it('allows REJECTED from any non-terminal state', () => {
    for (const s of ['APPLIED', 'IN_REVIEW', 'SHORTLISTED', 'INTERVIEWED', 'OFFERED'] as const) {
      expect(canTransition(s, 'REJECTED', 'RECRUITER')).toBe(true);
    }
  });

  it('forbids skipping forward stages', () => {
    expect(canTransition('APPLIED', 'SHORTLISTED', 'RECRUITER')).toBe(false);
    expect(canTransition('APPLIED', 'OFFERED', 'RECRUITER')).toBe(false);
    expect(canTransition('IN_REVIEW', 'INTERVIEWED', 'RECRUITER')).toBe(false);
  });

  it('forbids backward moves', () => {
    expect(canTransition('IN_REVIEW', 'APPLIED', 'RECRUITER')).toBe(false);
    expect(canTransition('OFFERED', 'IN_REVIEW', 'RECRUITER')).toBe(false);
  });

  it('cannot drive WITHDRAWN — that is candidate-only', () => {
    expect(canTransition('APPLIED', 'WITHDRAWN', 'RECRUITER')).toBe(false);
  });
});

describe('canTransition — SYSTEM', () => {
  it('rejects every transition by default', () => {
    expect(canTransition('OFFERED', 'REJECTED', 'SYSTEM')).toBe(false);
    expect(canTransition('APPLIED', 'IN_REVIEW', 'SYSTEM')).toBe(false);
  });
});

describe('canTransition — invariants', () => {
  it('never permits a self-transition', () => {
    for (const s of ['APPLIED', 'IN_REVIEW', 'OFFERED', 'HIRED'] as const) {
      for (const a of ['CANDIDATE', 'RECRUITER', 'SYSTEM'] as const) {
        expect(canTransition(s, s, a)).toBe(false);
      }
    }
  });
});

describe('buildHistoryEntry', () => {
  it('records actor + from/to + ISO timestamp', () => {
    const at = new Date('2026-05-08T12:00:00.000Z');
    expect(buildHistoryEntry('APPLIED', 'WITHDRAWN', 'CANDIDATE', at)).toEqual({
      from: 'APPLIED',
      to: 'WITHDRAWN',
      at: '2026-05-08T12:00:00.000Z',
      by: 'CANDIDATE',
    });
  });
});
