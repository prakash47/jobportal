import { describe, expect, it } from 'vitest';
import { CreateBroadcastDto, ListBroadcastsQueryDto } from './dto';

function valid(over: Record<string, unknown> = {}) {
  return {
    subject: 'Scheduled maintenance on Sunday',
    body: 'We will be down from 02:00 to 04:00 IST.',
    category: 'OPERATIONAL',
    segment: 'ALL_RECRUITERS',
    emailEnabled: true,
    inAppEnabled: false,
    ...over,
  };
}

/** The first issue's message, for asserting the admin is told WHY. */
function firstMessage(result: { success: boolean; error?: { issues: { message: string }[] } }) {
  return result.error?.issues[0]?.message ?? '';
}

describe('CreateBroadcastDto', () => {
  it('accepts a minimal operational email broadcast', () => {
    expect(CreateBroadcastDto.safeParse(valid()).success).toBe(true);
  });

  it('rejects a broadcast with no channel at all', () => {
    // Would otherwise produce a broadcast that "sends" to nobody and reports
    // success.
    const res = CreateBroadcastDto.safeParse(
      valid({ emailEnabled: false, inAppEnabled: false }),
    );
    expect(res.success).toBe(false);
    expect(firstMessage(res)).toContain('at least one channel');
  });

  it('rejects in-app to a candidate-only segment, and says why', () => {
    // The combination resolves to an empty audience because apps/web has no
    // notification surface. Accepting it would tell the admin their in-app
    // announcement went out when nothing was written and nothing could display.
    const res = CreateBroadcastDto.safeParse(
      valid({ segment: 'ALL_CANDIDATES', inAppEnabled: true }),
    );
    expect(res.success).toBe(false);
    expect(firstMessage(res)).toContain('recruiters only');
  });

  it('allows in-app on ALL_USERS — it narrows rather than failing', () => {
    expect(
      CreateBroadcastDto.safeParse(valid({ segment: 'ALL_USERS', inAppEnabled: true })).success,
    ).toBe(true);
  });

  it('rejects a half-configured CTA in either direction', () => {
    // The email layout takes {label, url} as a pair, so one without the other is
    // silently dropped — a button that renders nowhere, or a link with nothing
    // to click.
    const noUrl = CreateBroadcastDto.safeParse(valid({ ctaLabel: 'Read more' }));
    expect(noUrl.success).toBe(false);
    expect(firstMessage(noUrl)).toContain('both a label and a link');

    const noLabel = CreateBroadcastDto.safeParse(
      valid({ ctaUrl: 'https://careerqueue.in/status' }),
    );
    expect(noLabel.success).toBe(false);
  });

  it('accepts a complete https CTA', () => {
    expect(
      CreateBroadcastDto.safeParse(
        valid({ ctaLabel: 'Status page', ctaUrl: 'https://careerqueue.in/status' }),
      ).success,
    ).toBe(true);
  });

  it('rejects http:// and relative CTA links', () => {
    // http:// is rejected as well as malformed input: a platform-wide email is
    // not where thousands of people get sent to an unencrypted page. A relative
    // path is rejected because the email opens outside every one of our apps.
    for (const ctaUrl of ['http://careerqueue.in/status', '/status', 'javascript:alert(1)', 'nope']) {
      const res = CreateBroadcastDto.safeParse(valid({ ctaLabel: 'Go', ctaUrl }));
      expect(res.success, `expected ${ctaUrl} to be rejected`).toBe(false);
    }
  });

  it('is strict — an unknown key is a 400, not a silently ignored field', () => {
    // Without .strict() a typo'd `segement` would be dropped and the broadcast
    // would send to whatever the (absent, therefore invalid) segment defaulted
    // to. Here it cannot parse at all.
    expect(CreateBroadcastDto.safeParse(valid({ scheduledAt: '2026-09-01' })).success).toBe(false);
  });

  it('rejects a blank or whitespace-only subject and body', () => {
    expect(CreateBroadcastDto.safeParse(valid({ subject: '   ' })).success).toBe(false);
    expect(CreateBroadcastDto.safeParse(valid({ body: '\n\n  ' })).success).toBe(false);
  });

  it('trims the subject rather than storing the padding', () => {
    const res = CreateBroadcastDto.safeParse(valid({ subject: '  Maintenance  ' }));
    expect(res.success && res.data.subject).toBe('Maintenance');
  });

  it('accepts PROMOTIONAL as a DRAFT — the refusal lives at send, not here', () => {
    // Deliberate: an admin must be able to SAY a message is promotional. If the
    // category could not be selected they would compose it as operational and it
    // would go out ungated to everyone.
    expect(CreateBroadcastDto.safeParse(valid({ category: 'PROMOTIONAL' })).success).toBe(true);
  });
});

describe('ListBroadcastsQueryDto', () => {
  it('collapses an all-whitespace q to undefined', () => {
    // So `?q=` and a missing q are the same state rather than two that drift.
    const res = ListBroadcastsQueryDto.safeParse({ q: '   ' });
    expect(res.success && res.data.q).toBeUndefined();
  });

  it('collapses internal whitespace and caps the needle', () => {
    const res = ListBroadcastsQueryDto.safeParse({ q: 'a\n\n   b' });
    expect(res.success && res.data.q).toBe('a b');
    const long = ListBroadcastsQueryDto.safeParse({ q: 'x'.repeat(400) });
    expect(long.success && long.data.q?.length).toBe(100);
  });

  it('transforms rather than refines, so the service receives the CLEANED value', () => {
    // A .refine that validated a trimmed value while passing the RAW one
    // downstream is exactly how a whitespace-padded date defeated three guards
    // at once on the transactions console.
    const res = ListBroadcastsQueryDto.safeParse({ q: '  maintenance  ' });
    expect(res.success && res.data.q).toBe('maintenance');
  });

  it('rejects an unknown status rather than passing it to Prisma', () => {
    expect(ListBroadcastsQueryDto.safeParse({ status: 'ALL' }).success).toBe(false);
    expect(ListBroadcastsQueryDto.safeParse({ status: '__proto__' }).success).toBe(false);
  });

  it('rejects a non-numeric or zero page', () => {
    expect(ListBroadcastsQueryDto.safeParse({ page: '0' }).success).toBe(false);
    expect(ListBroadcastsQueryDto.safeParse({ page: 'two' }).success).toBe(false);
    expect(ListBroadcastsQueryDto.safeParse({ page: '3' }).success).toBe(true);
  });
});
