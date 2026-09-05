import { describe, expect, it } from 'vitest';
import { isActiveNavPath } from './active-path';

// The nav has three hrefs but the seeker browses far more routes than that, so
// exact matching would drop the highlight the moment anyone opens a result -
// which is the confusion this whole feature exists to remove. Every path below
// is a real route in apps/web/app, not a hypothetical.

describe('isActiveNavPath — Jobs', () => {
  it('matches the search page itself, with or without a query', () => {
    expect(isActiveNavPath('/jobs', '/jobs')).toBe(true);
    // usePathname() strips the query, but be explicit that /jobs is the unit.
    expect(isActiveNavPath('/jobs/', '/jobs')).toBe(true);
  });

  // app/job/[slug] - SINGULAR. An exact match lights nothing while you read a
  // job, which is exactly when you most want to know where you are.
  it('keeps Jobs lit on a job detail page', () => {
    expect(isActiveNavPath('/job/senior-software-engineer-acme-12345', '/jobs')).toBe(true);
  });

  // The four app/[...path] SEO landings. Three of them are job searches.
  it('keeps Jobs lit on the SEO landing pages', () => {
    expect(isActiveNavPath('/jobs-in-bangalore', '/jobs')).toBe(true);
    expect(isActiveNavPath('/jobs-in-bangalore-and-pune', '/jobs')).toBe(true);
    expect(isActiveNavPath('/react-jobs', '/jobs')).toBe(true);
    expect(isActiveNavPath('/react-jobs-in-bangalore', '/jobs')).toBe(true);
  });

  it('does not light Jobs on unrelated routes', () => {
    expect(isActiveNavPath('/', '/jobs')).toBe(false);
    expect(isActiveNavPath('/companies', '/jobs')).toBe(false);
    expect(isActiveNavPath('/saved-jobs', '/jobs')).toBe(false);
    expect(isActiveNavPath('/profile', '/jobs')).toBe(false);
  });

  // The trap in naive prefix matching: '/jobseeker-terms'.startsWith('/jobs')
  // is true, so a substring test would light Jobs on a policy page.
  it('does not match a path that merely starts with the same letters', () => {
    expect(isActiveNavPath('/jobseeker-terms', '/jobs')).toBe(false);
    expect(isActiveNavPath('/jobsomething', '/jobs')).toBe(false);
  });
});

describe('isActiveNavPath — Companies', () => {
  it('matches the directory and a company detail page', () => {
    expect(isActiveNavPath('/companies', '/companies')).toBe(true);
    // app/company/[handle] - singular again.
    expect(isActiveNavPath('/company/acme-corp-42', '/companies')).toBe(true);
  });

  // The fourth SEO landing is a company surface, not a job one.
  it('keeps Companies lit on /working-at-<slug>', () => {
    expect(isActiveNavPath('/working-at-acme-corp-42', '/companies')).toBe(true);
    expect(isActiveNavPath('/working-at-acme-corp-42', '/jobs')).toBe(false);
  });

  it('does not light Companies elsewhere', () => {
    expect(isActiveNavPath('/jobs', '/companies')).toBe(false);
    expect(isActiveNavPath('/', '/companies')).toBe(false);
  });
});

describe('isActiveNavPath — Career advice', () => {
  it('matches the list and an article', () => {
    expect(isActiveNavPath('/career-advice', '/career-advice')).toBe(true);
    expect(isActiveNavPath('/career-advice/how-to-write-a-cv', '/career-advice')).toBe(true);
  });

  it('does not light it elsewhere', () => {
    expect(isActiveNavPath('/jobs', '/career-advice')).toBe(false);
  });
});

describe('isActiveNavPath — exactly one tab at a time', () => {
  const NAV = ['/jobs', '/companies', '/career-advice'];
  const lit = (path: string) => NAV.filter((href) => isActiveNavPath(path, href));

  // Two lit tabs is worse than none: it tells the user something false.
  it.each([
    '/jobs',
    '/job/x-1',
    '/jobs-in-pune',
    '/react-jobs',
    '/react-jobs-in-pune',
    '/companies',
    '/company/x-1',
    '/working-at-x-1',
    '/career-advice',
    '/career-advice/post',
  ])('lights exactly one tab on %s', (path) => {
    expect(lit(path)).toHaveLength(1);
  });

  it.each(['/', '/profile', '/saved-jobs', '/applications', '/login'])(
    'lights no tab on %s',
    (path) => {
      expect(lit(path)).toHaveLength(0);
    },
  );
});

describe('isActiveNavPath — hostile input', () => {
  it('handles an empty or odd pathname without throwing', () => {
    expect(isActiveNavPath('', '/jobs')).toBe(false);
    expect(isActiveNavPath('//', '/jobs')).toBe(false);
  });

  // An href the table doesn't know falls back to exact/segment matching rather
  // than silently never matching - a new nav link should still light up.
  it('falls back sensibly for an unknown href', () => {
    expect(isActiveNavPath('/pricing', '/pricing')).toBe(true);
    expect(isActiveNavPath('/pricing/teams', '/pricing')).toBe(true);
    expect(isActiveNavPath('/pricing-guide', '/pricing')).toBe(false);
  });
});
