import { describe, expect, it } from 'vitest';
import { hydratePopularItems } from './queries';

describe('hydratePopularItems', () => {
  it('hydrates by id and preserves the group input order', () => {
    const groups = [
      { id: 3, jobCount: 42 },
      { id: 1, jobCount: 17 },
      { id: 2, jobCount: 9 },
    ];
    const hydrated = [
      { id: 1, slug: 'bangalore', name: 'Bangalore' },
      { id: 2, slug: 'pune', name: 'Pune' },
      { id: 3, slug: 'hyderabad', name: 'Hyderabad' },
    ];

    expect(hydratePopularItems(groups, hydrated)).toEqual([
      { slug: 'hyderabad', name: 'Hyderabad', jobCount: 42 },
      { slug: 'bangalore', name: 'Bangalore', jobCount: 17 },
      { slug: 'pune', name: 'Pune', jobCount: 9 },
    ]);
  });

  it('drops groups whose id has no hydration row', () => {
    // Simulates a popular skill that was soft-deleted between cache regenerations.
    const groups = [
      { id: 1, jobCount: 5 },
      { id: 999, jobCount: 3 },
      { id: 2, jobCount: 1 },
    ];
    const hydrated = [
      { id: 1, slug: 'react', name: 'React' },
      { id: 2, slug: 'node-js', name: 'Node.js' },
    ];

    expect(hydratePopularItems(groups, hydrated)).toEqual([
      { slug: 'react', name: 'React', jobCount: 5 },
      { slug: 'node-js', name: 'Node.js', jobCount: 1 },
    ]);
  });

  it('returns an empty array when there are no groups', () => {
    expect(hydratePopularItems([], [{ id: 1, slug: 'x', name: 'X' }])).toEqual([]);
  });
});
