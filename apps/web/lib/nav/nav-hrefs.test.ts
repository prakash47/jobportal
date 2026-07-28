import { describe, it, expect } from 'vitest';
import {
  cityHref,
  companiesHref,
  companyHref,
  highestPayingHref,
  jobIndustryHref,
  newestHref,
  roleHref,
  skillHref,
} from './nav-hrefs';

describe('nav-hrefs', () => {
  it('role query serializes spaces as + (canonical SRP tag)', () => {
    expect(roleHref('full stack')).toBe('/jobs?q=full+stack');
  });
  it('city uses ?city=<slug>', () => {
    expect(cityHref('bangalore')).toBe('/jobs?city=bangalore');
  });
  it('job industry uses ?industry=<slug>', () => {
    expect(jobIndustryHref('information-technology')).toBe('/jobs?industry=information-technology');
  });
  it('skill uses ?skill=<slug>', () => {
    expect(skillHref('react')).toBe('/jobs?skill=react');
  });
  it('newest maps to ?postedWithin=7', () => {
    expect(newestHref()).toBe('/jobs?postedWithin=7');
  });
  it('highest paying maps to ?sort=salary_desc', () => {
    expect(highestPayingHref()).toBe('/jobs?sort=salary_desc');
  });

  it('companies industry uses ?category=<slug> (not ?industry=)', () => {
    expect(companiesHref({ category: 'information-technology' })).toBe(
      '/companies?category=information-technology',
    );
  });
  it('companies hiring collection', () => {
    expect(companiesHref({ hiring: true })).toBe('/companies?hiring=1');
  });
  it('companies top-rated (default) is the bare /companies path', () => {
    expect(companiesHref({})).toBe('/companies');
  });
  it('companies most-reviewed collection', () => {
    expect(companiesHref({ sort: 'reviews' })).toBe('/companies?sort=reviews');
  });
  it('company profile href is slug-overview-id', () => {
    expect(companyHref('nimbus-cloud', 12)).toBe('/company/nimbus-cloud-overview-12');
  });
});
