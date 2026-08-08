import { describe, expect, it } from 'vitest';
import {
  buildCompanySlug,
  buildJobSlug,
  buildMultiCitySlug,
  buildWorkingAtSlug,
  parseCompanySlug,
  parseJobSlug,
  parseMultiCitySlug,
  parseSkillJobsInCitySlug,
  parseWorkingAtSlug,
  slugify,
} from './slug';

describe('slugify', () => {
  it('lowercases and dashes', () => {
    expect(slugify('Hello World')).toBe('hello-world');
  });
  it('strips diacritics', () => {
    expect(slugify('Café Résumé')).toBe('cafe-resume');
  });
  it('collapses non-alphanumeric runs', () => {
    expect(slugify('a   b---c!@#d')).toBe('a-b-c-d');
  });
  it('trims leading/trailing dashes', () => {
    expect(slugify('---hi---')).toBe('hi');
  });
});

describe('parseJobSlug / buildJobSlug', () => {
  it('parses a normal job slug', () => {
    expect(parseJobSlug('sales-executive-acme-12345')).toEqual({
      slug: 'sales-executive-acme',
      id: 12345,
    });
  });
  it('parses a single-word slug + id', () => {
    expect(parseJobSlug('engineer-99')).toEqual({ slug: 'engineer', id: 99 });
  });
  it('returns null for missing id', () => {
    expect(parseJobSlug('sales-executive')).toBeNull();
  });
  it('returns null for missing slug part', () => {
    expect(parseJobSlug('12345')).toBeNull();
  });
  it('returns null for invalid characters', () => {
    expect(parseJobSlug('Sales-Executive-12345')).toBeNull(); // uppercase
  });
  it('builds slug from title + id', () => {
    expect(buildJobSlug({ title: 'Sales Executive @ Acme', id: 12345 })).toBe(
      'sales-executive-acme-12345',
    );
  });
  it('roundtrips', () => {
    const built = buildJobSlug({ title: 'Senior Frontend Engineer', id: 7 });
    expect(parseJobSlug(built)).toEqual({ slug: 'senior-frontend-engineer', id: 7 });
  });
});

describe('parseCompanySlug / buildCompanySlug', () => {
  it('parses a normal company slug', () => {
    expect(parseCompanySlug('infosys-overview-13832')).toEqual({ slug: 'infosys', id: 13832 });
  });
  it('parses a multi-word company slug', () => {
    expect(parseCompanySlug('tata-consultancy-services-overview-2114')).toEqual({
      slug: 'tata-consultancy-services',
      id: 2114,
    });
  });
  it('returns null when -overview- is missing', () => {
    expect(parseCompanySlug('infosys-13832')).toBeNull();
  });
  it('builds slug from name + id', () => {
    expect(buildCompanySlug({ name: 'Infosys', id: 13832 })).toBe('infosys-overview-13832');
  });
});

describe('parseWorkingAtSlug / buildWorkingAtSlug', () => {
  it('parses', () => {
    expect(parseWorkingAtSlug('working-at-tcs-2114')).toEqual({ slug: 'tcs', id: 2114 });
  });
  it('builds', () => {
    expect(buildWorkingAtSlug({ name: 'TCS', id: 2114 })).toBe('working-at-tcs-2114');
  });
});

describe('parseMultiCitySlug / buildMultiCitySlug', () => {
  it('parses single city', () => {
    expect(parseMultiCitySlug('jobs-in-bangalore')).toEqual(['bangalore']);
  });
  it('parses multi city in arrival order (NOT sorted)', () => {
    expect(parseMultiCitySlug('jobs-in-mumbai-and-pune-and-bangalore')).toEqual([
      'mumbai',
      'pune',
      'bangalore',
    ]);
  });
  it('returns null when prefix is missing', () => {
    expect(parseMultiCitySlug('python-jobs')).toBeNull();
  });
  it('builds with alphabetical sort (SRS §6.3)', () => {
    expect(buildMultiCitySlug(['pune', 'mumbai', 'bangalore'])).toBe(
      'jobs-in-bangalore-and-mumbai-and-pune',
    );
  });
});

describe('parseSkillJobsInCitySlug', () => {
  it('parses skill + single city', () => {
    expect(parseSkillJobsInCitySlug('python-jobs-in-pune')).toEqual({
      skill: 'python',
      cities: ['pune'],
    });
  });
  it('parses multi-word skill + multi city', () => {
    expect(parseSkillJobsInCitySlug('machine-learning-jobs-in-bangalore-and-pune')).toEqual({
      skill: 'machine-learning',
      cities: ['bangalore', 'pune'],
    });
  });
  it('returns null when shape does not match', () => {
    expect(parseSkillJobsInCitySlug('jobs-in-pune')).toBeNull();
    expect(parseSkillJobsInCitySlug('python-jobs')).toBeNull();
  });
});
