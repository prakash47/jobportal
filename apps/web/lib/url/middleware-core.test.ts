import { describe, expect, it } from 'vitest';
import { computeCanonicalRedirect } from './middleware-core';

function check(input: string, expected: string | null): void {
  const result = computeCanonicalRedirect(new URL(input));
  if (expected === null) {
    expect(result).toBeNull();
  } else {
    expect(result).not.toBeNull();
    expect(result?.toString()).toBe(expected);
  }
}

describe('computeCanonicalRedirect', () => {
  it('returns null when URL is already canonical', () => {
    check('https://www.jobportal.com/jobs-in-bangalore', null);
  });

  it('redirects uppercase to lowercase', () => {
    check(
      'https://www.jobportal.com/Jobs-In-Bangalore',
      'https://www.jobportal.com/jobs-in-bangalore',
    );
  });

  it('strips trailing slash', () => {
    check(
      'https://www.jobportal.com/jobs-in-bangalore/',
      'https://www.jobportal.com/jobs-in-bangalore',
    );
  });

  it('sorts multi-city alphabetically', () => {
    check(
      'https://www.jobportal.com/jobs-in-pune-and-bangalore',
      'https://www.jobportal.com/jobs-in-bangalore-and-pune',
    );
  });

  it('combines case + slash + multi-city in one redirect', () => {
    check(
      'https://www.jobportal.com/Jobs-In-Pune-And-Bangalore/',
      'https://www.jobportal.com/jobs-in-bangalore-and-pune',
    );
  });

  it('strips tracking params and sorts the rest', () => {
    check(
      'https://www.jobportal.com/jobs-in-bangalore?utm_source=twitter&sort=recent&q=python',
      'https://www.jobportal.com/jobs-in-bangalore?q=python&sort=recent',
    );
  });

  it('handles skill-prefixed multi-city', () => {
    check(
      'https://www.jobportal.com/Python-Jobs-In-Pune-And-Bangalore',
      'https://www.jobportal.com/python-jobs-in-bangalore-and-pune',
    );
  });

  it('preserves the canonical when only the query needed sorting', () => {
    check(
      'https://www.jobportal.com/jobs-in-bangalore?b=2&a=1',
      'https://www.jobportal.com/jobs-in-bangalore?a=1&b=2',
    );
  });

  it('returns null when query has only tracking params already absent', () => {
    check('https://www.jobportal.com/jobs-in-bangalore?a=1&b=2', null);
  });
});
