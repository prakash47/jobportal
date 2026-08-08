import { describe, expect, it } from 'vitest';
import { buildSrpHref, parseSrpSearchParams } from './srp-params';

describe('parseSrpSearchParams', () => {
  it('parses an empty query', () => {
    expect(parseSrpSearchParams({})).toEqual({});
  });

  it('parses a free-text query', () => {
    expect(parseSrpSearchParams({ q: 'engineer' })).toEqual({ q: 'engineer' });
  });

  it('parses single-value filters', () => {
    expect(
      parseSrpSearchParams({
        skill: 'react',
        city: 'bangalore',
        industry: 'it-software',
      }),
    ).toEqual({
      skillSlugs: ['react'],
      citySlugs: ['bangalore'],
      industrySlug: 'it-software',
    });
  });

  it('parses repeated keys as arrays', () => {
    expect(
      parseSrpSearchParams({
        skill: ['react', 'typescript'],
        city: ['bangalore', 'pune'],
      }),
    ).toEqual({
      skillSlugs: ['react', 'typescript'],
      citySlugs: ['bangalore', 'pune'],
    });
  });

  it('converts experience years → months', () => {
    expect(parseSrpSearchParams({ expMin: '2', expMax: '5' })).toEqual({
      minExperienceMonths: 24,
      maxExperienceMonths: 60,
    });
  });

  it('parses salaryMin as integer paise', () => {
    expect(parseSrpSearchParams({ salaryMin: '1500000' })).toEqual({ salaryMin: 1_500_000 });
  });

  it('only allows 1 / 7 / 30 for postedWithin', () => {
    expect(parseSrpSearchParams({ postedWithin: '7' })).toEqual({ postedWithinDays: 7 });
    expect(parseSrpSearchParams({ postedWithin: '14' })).toEqual({});
    expect(parseSrpSearchParams({ postedWithin: 'abc' })).toEqual({});
  });

  it('accepts only valid sort modes', () => {
    expect(parseSrpSearchParams({ sort: 'recent' })).toEqual({ sort: 'recent' });
    expect(parseSrpSearchParams({ sort: 'salary_desc' })).toEqual({ sort: 'salary_desc' });
    expect(parseSrpSearchParams({ sort: 'random' })).toEqual({});
  });

  it('accepts a positive page integer', () => {
    expect(parseSrpSearchParams({ page: '3' })).toEqual({ page: 3 });
    expect(parseSrpSearchParams({ page: '0' })).toEqual({});
    expect(parseSrpSearchParams({ page: '-1' })).toEqual({});
    expect(parseSrpSearchParams({ page: 'abc' })).toEqual({});
  });

  // ADR 0002 decision 6. Until this shipped, the assertion here was
  // `toEqual({})` — the suite pinned the bug in place: both facets rendered on
  // the live SRP and filtered nothing.
  it('maps emp onto employmentTypes using the enum spelling', () => {
    expect(parseSrpSearchParams({ emp: 'FULL_TIME' })).toEqual({
      employmentTypes: ['FULL_TIME'],
    });
    expect(parseSrpSearchParams({ emp: ['FULL_TIME', 'INTERN'] })).toEqual({
      employmentTypes: ['FULL_TIME', 'INTERN'],
    });
  });

  // The URL spelling is NOT the enum spelling for this facet, and the URL side
  // is frozen (buildSrpHref echoes it verbatim into links Google has indexed).
  // If this mapping is ever dropped, `mode=on-site` silently returns zero
  // results instead of the 17 onsite jobs.
  it('normalises mode URL spellings onto the WorkMode enum', () => {
    expect(parseSrpSearchParams({ mode: 'on-site' })).toEqual({ workModes: ['ONSITE'] });
    expect(parseSrpSearchParams({ mode: 'hybrid' })).toEqual({ workModes: ['HYBRID'] });
    expect(parseSrpSearchParams({ mode: 'remote' })).toEqual({ workModes: ['REMOTE'] });
  });

  it('combines the two facets', () => {
    expect(parseSrpSearchParams({ emp: 'INTERN', mode: ['remote', 'hybrid'] })).toEqual({
      employmentTypes: ['INTERN'],
      workModes: ['REMOTE', 'HYBRID'],
    });
  });

  // Forwarding an unknown value would turn today's "200 with unfiltered
  // results" into "0 results" for any stale or hand-edited URL.
  it('drops unknown facet values instead of forwarding them', () => {
    expect(parseSrpSearchParams({ emp: 'BOGUS', mode: 'teleport' })).toEqual({});
    // A partially-valid selection keeps only the values that exist.
    expect(parseSrpSearchParams({ emp: ['FULL_TIME', 'BOGUS'] })).toEqual({
      employmentTypes: ['FULL_TIME'],
    });
    // Casing is not normalised — these are exact-match tables, and accepting
    // variants would mint duplicate URLs for one result set.
    expect(parseSrpSearchParams({ emp: 'full_time', mode: 'ONSITE' })).toEqual({});
  });

  it('de-duplicates repeated facet values', () => {
    expect(parseSrpSearchParams({ mode: ['remote', 'remote'] })).toEqual({
      workModes: ['REMOTE'],
    });
  });
});

describe('buildSrpHref', () => {
  it('returns the base path when no params', () => {
    expect(buildSrpHref('/python-jobs', {})).toBe('/python-jobs');
  });

  it('appends single-value params alphabetically', () => {
    expect(
      buildSrpHref('/python-jobs', {
        industrySlug: 'it-software',
        salaryMin: 1_500_000,
      }),
    ).toBe('/python-jobs?industry=it-software&salaryMin=1500000');
  });

  it('repeats multi-select keys', () => {
    expect(
      buildSrpHref('/jobs', {
        skillSlugs: ['react', 'typescript'],
        citySlugs: ['bangalore', 'pune'],
      }),
    ).toBe('/jobs?city=bangalore&city=pune&skill=react&skill=typescript');
  });

  it('converts experience months → years for the URL', () => {
    expect(
      buildSrpHref('/jobs', { minExperienceMonths: 24, maxExperienceMonths: 60 }),
    ).toBe('/jobs?expMax=5&expMin=2');
  });

  it('omits the default sort (relevance)', () => {
    expect(buildSrpHref('/jobs', { sort: 'relevance' })).toBe('/jobs');
    expect(buildSrpHref('/jobs', { sort: 'recent' })).toBe('/jobs?sort=recent');
  });

  it('omits page=1 (default)', () => {
    expect(buildSrpHref('/jobs', { page: 1 })).toBe('/jobs');
    expect(buildSrpHref('/jobs', { page: 3 })).toBe('/jobs?page=3');
  });

  it('roundtrips through parseSrpSearchParams', () => {
    const built = buildSrpHref('/python-jobs', {
      skillSlugs: ['react'],
      industrySlug: 'it-software',
      // The href side carries URL spellings; the parsed side carries enum
      // values. This is the one facet pair where those two differ, so the
      // roundtrip is what proves the boundary is wired in both directions.
      emp: ['FULL_TIME'],
      mode: ['on-site'],
      minExperienceMonths: 36,
      salaryMin: 1_200_000,
      postedWithinDays: 7,
      sort: 'salary_desc',
      page: 2,
    });
    const url = new URL(`http://x.com${built}`);
    const sp: Record<string, string | string[]> = {};
    for (const [k, v] of url.searchParams) {
      const existing = sp[k];
      if (existing === undefined) sp[k] = v;
      else if (Array.isArray(existing)) existing.push(v);
      else sp[k] = [existing, v];
    }
    expect(parseSrpSearchParams(sp)).toEqual({
      skillSlugs: ['react'],
      industrySlug: 'it-software',
      employmentTypes: ['FULL_TIME'],
      workModes: ['ONSITE'],
      minExperienceMonths: 36,
      salaryMin: 1_200_000,
      postedWithinDays: 7,
      sort: 'salary_desc',
      page: 2,
    });
  });
});
