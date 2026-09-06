import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildCanonical } from './canonical';

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env.NEXT_PUBLIC_WEB_URL = 'https://www.jobportal.com';
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('buildCanonical', () => {
  it('returns an absolute URL', () => {
    expect(buildCanonical('/jobs-in-bangalore')).toBe('https://www.jobportal.com/jobs-in-bangalore');
  });

  it('lowercases pathname', () => {
    expect(buildCanonical('/Jobs-In-Bangalore')).toBe(
      'https://www.jobportal.com/jobs-in-bangalore',
    );
  });

  it('strips trailing slash', () => {
    expect(buildCanonical('/jobs-in-bangalore/')).toBe(
      'https://www.jobportal.com/jobs-in-bangalore',
    );
  });

  it('strips tracking params', () => {
    expect(buildCanonical('/jobs-in-bangalore', 'utm_source=twitter&q=python')).toBe(
      'https://www.jobportal.com/jobs-in-bangalore?q=python',
    );
  });

  it('sorts query params', () => {
    expect(buildCanonical('/jobs-in-bangalore', 'sort=recent&q=python&page=2')).toBe(
      'https://www.jobportal.com/jobs-in-bangalore?page=2&q=python&sort=recent',
    );
  });

  it('accepts URLSearchParams instances', () => {
    const sp = new URLSearchParams();
    sp.append('q', 'engineer');
    sp.append('page', '3');
    expect(buildCanonical('/jobs-in-pune', sp)).toBe(
      'https://www.jobportal.com/jobs-in-pune?page=3&q=engineer',
    );
  });

  it('falls back to localhost when NEXT_PUBLIC_WEB_URL is unset', () => {
    delete process.env.NEXT_PUBLIC_WEB_URL;
    delete process.env.WEB_URL;
    expect(buildCanonical('/x')).toBe('http://localhost:3000/x');
  });
});

// Added with feature/applications-back-navigation.
describe('buildCanonical — UI-state params', () => {
  it('excludes ?from= so one posting has one canonical', () => {
    expect(buildCanonical('/job/engineer-acme-1', 'from=applications')).toBe(
      buildCanonical('/job/engineer-acme-1'),
    );
  });

  it('keeps genuine content params alongside it', () => {
    expect(buildCanonical('/jobs', 'from=applications&page=2')).toContain('?page=2');
    expect(buildCanonical('/jobs', 'from=applications&page=2')).not.toContain('from');
  });
});
