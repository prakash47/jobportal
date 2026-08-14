import { describe, expect, it } from 'vitest';
import {
  REPORT_DETAILS_MAX,
  REPORT_REASON_LABELS,
  REPORT_REASON_ORDER,
  reportErrorMessage,
} from './report';

describe('REPORT_REASON_LABELS', () => {
  // The Record type makes a MISSING label a compile error. This is the half the
  // type cannot check: that the order list and the label table describe the same
  // set, so no reason is silently unrenderable and no order entry is a ghost.
  it('has a label for every ordered reason and vice versa', () => {
    expect([...REPORT_REASON_ORDER].sort()).toEqual(Object.keys(REPORT_REASON_LABELS).sort());
  });

  it('keeps "Something else" last so it reads as the fallback', () => {
    expect(REPORT_REASON_ORDER[REPORT_REASON_ORDER.length - 1]).toBe('OTHER');
  });

  it('renders human copy, never a raw enum value', () => {
    for (const reason of REPORT_REASON_ORDER) {
      const label = REPORT_REASON_LABELS[reason];
      expect(label).toBeTruthy();
      expect(label).not.toMatch(/^[A-Z_]+$/);
    }
  });

  it('matches the DTO cap', () => {
    expect(REPORT_DETAILS_MAX).toBe(2000);
  });
});

describe('reportErrorMessage', () => {
  // Each status the endpoint can actually answer with must produce its OWN
  // sentence — a generic fallback for 409 or 503 would tell a reporter their
  // report failed when it was in fact refused for a reason they can act on.
  it('gives a distinct message per known status', () => {
    const known = [409, 429, 503, 404, 400];
    const messages = known.map(reportErrorMessage);
    expect(new Set(messages).size).toBe(known.length);
    for (const m of messages) {
      expect(m).not.toBe(reportErrorMessage(500));
    }
  });

  it('names the duplicate case rather than reading as a failure', () => {
    expect(reportErrorMessage(409)).toMatch(/already reported/i);
  });

  it('says a 503 is temporary', () => {
    expect(reportErrorMessage(503)).toMatch(/temporarily|try again later/i);
  });

  it('tells a throttled reporter to wait', () => {
    expect(reportErrorMessage(429)).toMatch(/wait|short time/i);
  });

  it('falls back for unexpected statuses', () => {
    for (const status of [500, 502, 0, 418]) {
      expect(reportErrorMessage(status)).toMatch(/something went wrong/i);
    }
  });

  // Copy discipline: no raw status codes or internal vocabulary leaking to a
  // job seeker.
  it('never leaks a status code or internal term', () => {
    for (const status of [400, 404, 409, 429, 500, 503]) {
      const m = reportErrorMessage(status);
      expect(m).not.toMatch(/\b\d{3}\b/);
      expect(m).not.toMatch(/flag|killswitch|ContentReport|503|DTO/i);
    }
  });
});
