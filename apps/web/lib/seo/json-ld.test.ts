import { describe, expect, it } from 'vitest';
import { article, breadcrumbList, faqPage, itemList, jobPosting, organization } from './json-ld';

describe('itemList', () => {
  it('numbers items 1..N', () => {
    const out = itemList({
      name: 'Python Jobs',
      items: [
        { name: 'A', url: '/a' },
        { name: 'B', url: '/b' },
      ],
    });
    expect(out['@type']).toBe('ItemList');
    expect(out.itemListElement).toHaveLength(2);
    expect(out.itemListElement[0]).toMatchObject({ position: 1, url: '/a', name: 'A' });
    expect(out.itemListElement[1]).toMatchObject({ position: 2, url: '/b', name: 'B' });
  });
});

describe('breadcrumbList', () => {
  it('places `item` as URL, not nested object', () => {
    const out = breadcrumbList([
      { name: 'Home', url: 'https://x.com/' },
      { name: 'Jobs', url: 'https://x.com/jobs' },
    ]);
    expect(out['@type']).toBe('BreadcrumbList');
    expect(out.itemListElement[0]).toMatchObject({ position: 1, name: 'Home', item: 'https://x.com/' });
  });
});

describe('jobPosting', () => {
  it('includes required fields in Google for Jobs shape', () => {
    const out = jobPosting({
      title: 'Senior Frontend Engineer',
      description: '<p>Build the dashboard.</p>',
      datePosted: '2026-05-07T00:00:00Z',
      hiringOrganization: { name: 'Acme', sameAs: 'https://acme.example' },
    });
    expect(out['@type']).toBe('JobPosting');
    expect(out['title']).toBe('Senior Frontend Engineer');
    expect(out['datePosted']).toBe('2026-05-07T00:00:00Z');
    expect((out['hiringOrganization'] as Record<string, unknown>)['@type']).toBe('Organization');
  });

  it('omits optional fields when not provided', () => {
    const out = jobPosting({
      title: 'X',
      description: 'Y',
      datePosted: '2026-05-07',
      hiringOrganization: { name: 'A' },
    });
    expect('validThrough' in out).toBe(false);
    expect('employmentType' in out).toBe(false);
    expect('baseSalary' in out).toBe(false);
    expect('jobLocation' in out).toBe(false);
  });

  it('serialises baseSalary correctly when present', () => {
    const out = jobPosting({
      title: 'X',
      description: 'Y',
      datePosted: '2026-05-07',
      hiringOrganization: { name: 'A' },
      baseSalary: { currency: 'INR', minValue: 1_000_000, maxValue: 2_000_000, unitText: 'YEAR' },
    });
    expect(out['baseSalary']).toMatchObject({
      '@type': 'MonetaryAmount',
      currency: 'INR',
      value: { minValue: 1_000_000, maxValue: 2_000_000, unitText: 'YEAR' },
    });
  });
});

describe('organization', () => {
  it('builds basic shape', () => {
    const out = organization({
      name: 'Infosys',
      url: 'https://www.jobportal.com/infosys-overview-13832',
    });
    expect(out['@type']).toBe('Organization');
    expect(out['name']).toBe('Infosys');
  });

  it('omits empty sameAs arrays', () => {
    const out = organization({ name: 'X', url: '/x', sameAs: [] });
    expect('sameAs' in out).toBe(false);
  });
});

describe('article', () => {
  it('builds with required fields', () => {
    const out = article({
      headline: 'How to write a cover letter',
      datePublished: '2026-05-07',
      author: { name: 'Editor' },
    });
    expect(out['@type']).toBe('Article');
    expect(out['headline']).toBe('How to write a cover letter');
    expect((out['author'] as Record<string, unknown>)['@type']).toBe('Person');
  });
});

describe('faqPage', () => {
  it('wraps each Q in mainEntity', () => {
    const out = faqPage([{ question: 'Q1?', answer: 'A1.' }]);
    expect(out['@type']).toBe('FAQPage');
    expect(out.mainEntity).toHaveLength(1);
    expect(out.mainEntity[0]).toMatchObject({
      '@type': 'Question',
      name: 'Q1?',
      acceptedAnswer: { '@type': 'Answer', text: 'A1.' },
    });
  });
});
