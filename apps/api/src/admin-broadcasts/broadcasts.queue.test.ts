import { describe, expect, it } from 'vitest';
import { broadcastJobId } from './broadcasts.queue';

/**
 * ⚠ THIS FILE EXISTS BECAUSE OF A BUG NO OTHER TEST COULD HAVE CAUGHT.
 *
 * Every unit test in this module mocks the enqueue callback, so a job id that
 * BullMQ itself rejects passed the entire suite. The ids originally used colons
 * (`broadcast:1:plan`), and BullMQ's `Job.addJob` throws "Custom Id cannot
 * contain :" because the colon is Redis's own key separator.
 *
 * The failure mode was quiet and expensive: the plan job wrote its recipient
 * ledger and every in-app row, threw when it fanned out, exhausted its three
 * attempts, and left the broadcast stuck in SENDING with all 31 recipients
 * PENDING and not one email sent. The console showed a send in progress that
 * would never progress.
 */
describe('broadcastJobId', () => {
  it('never contains a colon — BullMQ rejects a custom id that does', () => {
    expect(broadcastJobId({ kind: 'plan', broadcastId: 1 })).not.toContain(':');
    expect(
      broadcastJobId({ kind: 'deliver', broadcastId: 1, recipientId: 55 }),
    ).not.toContain(':');
  });

  it('is deterministic, so a retried dispatch cannot start a second planning pass', () => {
    expect(broadcastJobId({ kind: 'plan', broadcastId: 7 })).toBe(
      broadcastJobId({ kind: 'plan', broadcastId: 7 }),
    );
  });

  it('is distinct per broadcast and per recipient', () => {
    // A collision here would silently swallow a real recipient's email, because
    // BullMQ treats a duplicate custom id as "already queued".
    const ids = new Set([
      broadcastJobId({ kind: 'plan', broadcastId: 1 }),
      broadcastJobId({ kind: 'plan', broadcastId: 2 }),
      broadcastJobId({ kind: 'deliver', broadcastId: 1, recipientId: 1 }),
      broadcastJobId({ kind: 'deliver', broadcastId: 1, recipientId: 2 }),
      broadcastJobId({ kind: 'deliver', broadcastId: 2, recipientId: 1 }),
    ]);
    expect(ids.size).toBe(5);
  });

  it('cannot collide across the two kinds by concatenation', () => {
    // A naive `broadcast-1-2` scheme would let plan(12) and deliver(1, 2) meet.
    // The kind word between the numbers is what prevents it.
    expect(broadcastJobId({ kind: 'plan', broadcastId: 12 })).not.toBe(
      broadcastJobId({ kind: 'deliver', broadcastId: 1, recipientId: 2 }),
    );
  });
});
