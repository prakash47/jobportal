// SRS §4.6.2 — application status state machine.
//
// Three actors transition rows: CANDIDATE (only WITHDRAWN), RECRUITER (all
// other forward / reject moves), and SYSTEM (reserved for future automated
// transitions like auto-expire of stale offers).
//
// Terminal states (HIRED, REJECTED, WITHDRAWN) accept no further transitions
// and the dashboard hides the Withdraw button on them.
//
// Status enum lives on the Prisma side; this module operates on the string
// literal type to stay testable without pulling in Prisma at module load.

import type { ApplicationStatus } from '@jobportal/db';

export type Actor = 'CANDIDATE' | 'RECRUITER' | 'SYSTEM';

const TERMINAL: ReadonlySet<ApplicationStatus> = new Set(['HIRED', 'REJECTED', 'WITHDRAWN']);

// Forward path the recruiter walks. Each row may also branch to REJECTED at
// any point (handled separately) and the candidate may step out via WITHDRAWN
// from any non-terminal state.
const RECRUITER_FORWARD: Partial<Record<ApplicationStatus, ApplicationStatus[]>> = {
  APPLIED: ['IN_REVIEW', 'REJECTED'],
  IN_REVIEW: ['SHORTLISTED', 'REJECTED'],
  SHORTLISTED: ['INTERVIEWED', 'REJECTED'],
  INTERVIEWED: ['OFFERED', 'REJECTED'],
  OFFERED: ['HIRED', 'REJECTED'],
};

export function isTerminal(status: ApplicationStatus): boolean {
  return TERMINAL.has(status);
}

export function canTransition(
  from: ApplicationStatus,
  to: ApplicationStatus,
  actor: Actor,
): boolean {
  if (from === to) return false;
  if (isTerminal(from)) return false;

  if (actor === 'CANDIDATE') {
    // Candidates may only walk out the WITHDRAWN exit, and only from a
    // non-terminal state (the isTerminal(from) guard above already covers it).
    return to === 'WITHDRAWN';
  }

  if (actor === 'RECRUITER') {
    const allowed = RECRUITER_FORWARD[from];
    return allowed?.includes(to) ?? false;
  }

  // SYSTEM transitions reserved for future auto-expiry workflows; reject by
  // default until a concrete rule is added so we don't accidentally permit
  // anything.
  return false;
}

export interface StatusHistoryEntry {
  from: ApplicationStatus;
  to: ApplicationStatus;
  at: string; // ISO 8601
  by: Actor;
}

// Helper to build the history entry the controller appends to
// Application.statusHistory on every transition.
export function buildHistoryEntry(
  from: ApplicationStatus,
  to: ApplicationStatus,
  actor: Actor,
  now: Date = new Date(),
): StatusHistoryEntry {
  return { from, to, at: now.toISOString(), by: actor };
}
