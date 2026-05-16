import { describe, expect, it } from 'vitest';
import { scrubMessage, scrubSentryEvent, scrubUrl } from './scrub';

describe('scrubUrl', () => {
  it('masks ?token=', () => {
    expect(scrubUrl('https://x.com/reset?token=abc123')).toBe(
      'https://x.com/reset?token=[REDACTED]',
    );
  });

  it('masks ?code= / ?confirm= / ?nonce= / ?t= (single-letter token)', () => {
    expect(scrubUrl('/verify?code=xyz')).toBe('/verify?code=[REDACTED]');
    expect(scrubUrl('/x?confirm=zzz')).toBe('/x?confirm=[REDACTED]');
    expect(scrubUrl('/x?nonce=zzz')).toBe('/x?nonce=[REDACTED]');
    expect(scrubUrl('/x?t=zzz')).toBe('/x?t=[REDACTED]');
  });

  it('masks &token= when token is not the first param', () => {
    expect(scrubUrl('/x?utm=foo&token=secret')).toBe(
      '/x?utm=foo&token=[REDACTED]',
    );
  });

  it('preserves unrelated params verbatim', () => {
    expect(scrubUrl('/jobs?q=python&sort=recent&page=2')).toBe(
      '/jobs?q=python&sort=recent&page=2',
    );
  });

  it('is case-insensitive on the param name', () => {
    expect(scrubUrl('/x?Token=secret')).toBe('/x?Token=[REDACTED]');
    expect(scrubUrl('/x?TOKEN=secret')).toBe('/x?TOKEN=[REDACTED]');
  });

  it('does NOT mask a substring match like "tokenized"', () => {
    // The regex anchors on word boundary via the param-name alternation,
    // so "tokenized" as a value or "tokenize=" as a name passes through.
    expect(scrubUrl('/x?tokenize=yes')).toBe('/x?tokenize=yes');
  });

  it('empty / no-query URLs pass through', () => {
    expect(scrubUrl('')).toBe('');
    expect(scrubUrl('/jobs')).toBe('/jobs');
  });

  it('handles multiple sensitive params in one URL', () => {
    expect(scrubUrl('/x?token=a&nonce=b&q=python')).toBe(
      '/x?token=[REDACTED]&nonce=[REDACTED]&q=python',
    );
  });
});

describe('scrubMessage', () => {
  it('scrubs URLs embedded in error messages', () => {
    expect(scrubMessage('fetch failed for /reset?token=abc')).toBe(
      'fetch failed for /reset?token=[REDACTED]',
    );
  });

  it('leaves token-free messages alone', () => {
    expect(scrubMessage('connection refused')).toBe('connection refused');
  });
});

describe('scrubSentryEvent', () => {
  it('scrubs event.request.url + query_string', () => {
    const out = scrubSentryEvent({
      request: { url: '/x?token=abc', query_string: 'token=abc&q=python' },
    });
    expect(out.request?.url).toBe('/x?token=[REDACTED]');
    // Sentry's Node SDK emits query_string without the leading ? — the
    // scrubber prepends one so the regex matches anyway, then strips
    // it back off. Verifies the fix for the PR #32 reviewer-flagged
    // PII leak.
    expect(out.request?.query_string).toBe('token=[REDACTED]&q=python');
  });

  it('query_string with multiple sensitive params is scrubbed', () => {
    const out = scrubSentryEvent({
      request: { query_string: 'token=a&nonce=b&q=python' },
    });
    expect(out.request?.query_string).toBe(
      'token=[REDACTED]&nonce=[REDACTED]&q=python',
    );
  });

  it('scrubs event.message', () => {
    const out = scrubSentryEvent({ message: 'failed at /reset?token=abc' });
    expect(out.message).toBe('failed at /reset?token=[REDACTED]');
  });

  it('scrubs each exception value', () => {
    const out = scrubSentryEvent({
      exception: {
        values: [
          { value: 'fetch failed for /a?token=1' },
          { value: 'fetch failed for /b?nonce=2' },
        ],
      },
    });
    expect(out.exception?.values?.[0]?.value).toBe(
      'fetch failed for /a?token=[REDACTED]',
    );
    expect(out.exception?.values?.[1]?.value).toBe(
      'fetch failed for /b?nonce=[REDACTED]',
    );
  });

  it('scrubs breadcrumb url + message', () => {
    const out = scrubSentryEvent({
      breadcrumbs: [
        { data: { url: '/x?token=abc' }, message: 'hit /y?code=def' },
      ],
    });
    expect(out.breadcrumbs?.[0]?.data?.url).toBe('/x?token=[REDACTED]');
    expect(out.breadcrumbs?.[0]?.message).toBe('hit /y?code=[REDACTED]');
  });

  it('event with no scrubbable fields passes through untouched', () => {
    const event = { message: 'plain error' };
    expect(scrubSentryEvent(event)).toEqual({ message: 'plain error' });
  });
});
