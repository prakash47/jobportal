import { describe, expect, it } from 'vitest';
import {
  categoryLabel,
  groupByCategory,
  resolveTypedSkill,
  searchSkills,
  slugifySkill,
  type SkillEntry,
} from './skills';

const skill = (id: number, name: string, category: string | null): SkillEntry => ({
  id,
  slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
  name,
  category,
});

const CATALOGUE: SkillEntry[] = [
  skill(1, 'React', 'framework'),
  skill(2, 'TypeScript', 'language'),
  skill(3, 'Python', 'language'),
  skill(4, 'PostgreSQL', 'database'),
  skill(5, 'Communication', 'soft'),
  skill(6, 'Curiosity', null),
];

describe('categoryLabel', () => {
  it('maps stored tags to readable names', () => {
    expect(categoryLabel('soft')).toBe('Soft skills');
    expect(categoryLabel('ml')).toBe('Data & ML');
    expect(categoryLabel('language')).toBe('Languages');
  });

  it('falls back to Other for null and unknown tags', () => {
    expect(categoryLabel(null)).toBe('Other');
    expect(categoryLabel('something-new')).toBe('Other');
  });
});

describe('groupByCategory', () => {
  it('orders groups deliberately, not alphabetically', () => {
    const labels = groupByCategory(CATALOGUE).map((g) => g.label);
    expect(labels.indexOf('Languages')).toBeLessThan(labels.indexOf('Frameworks'));
    expect(labels.indexOf('Frameworks')).toBeLessThan(labels.indexOf('Soft skills'));
  });

  it('puts Other last', () => {
    expect(groupByCategory(CATALOGUE).at(-1)?.label).toBe('Other');
  });

  it('drops empty groups so a search never shows a bare heading', () => {
    const groups = groupByCategory([skill(1, 'React', 'framework')]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.label).toBe('Frameworks');
  });

  it('keeps every skill exactly once', () => {
    const total = groupByCategory(CATALOGUE).reduce((n, g) => n + g.skills.length, 0);
    expect(total).toBe(CATALOGUE.length);
  });

  it('returns nothing for an empty catalogue', () => {
    expect(groupByCategory([])).toEqual([]);
  });
});

describe('searchSkills', () => {
  it('returns NOTHING for an empty query — the pool stays hidden until you type', () => {
    expect(searchSkills(CATALOGUE, '')).toEqual([]);
    expect(searchSkills(CATALOGUE, '   ')).toEqual([]);
  });

  it('matches case-insensitively', () => {
    expect(searchSkills(CATALOGUE, 'REACT').map((s) => s.name)).toEqual(['React']);
  });

  it('ranks prefix matches first', () => {
    // "p" starts Python and PostgreSQL, and appears inside TypeScript.
    const names = searchSkills(CATALOGUE, 'p').map((s) => s.name);
    expect(names.slice(0, 2)).toEqual(['Python', 'PostgreSQL']);
    expect(names).toContain('TypeScript');
  });

  it('is empty when nothing matches', () => {
    expect(searchSkills(CATALOGUE, 'zzz')).toEqual([]);
  });
});

describe('slugifySkill', () => {
  it('matches the API normalisation', () => {
    expect(slugifySkill('React.js')).toBe('react-js');
    expect(slugifySkill('  Node  ')).toBe('node');
    expect(slugifySkill('C++')).toBe('c');
  });

  it('is empty when nothing usable remains', () => {
    expect(slugifySkill('!!!')).toBe('');
    expect(slugifySkill('   ')).toBe('');
  });
});

describe('resolveTypedSkill', () => {
  it('reports an empty query', () => {
    expect(resolveTypedSkill(CATALOGUE, '  ').kind).toBe('empty');
    expect(resolveTypedSkill(CATALOGUE, '!!!').kind).toBe('empty');
  });

  it('finds an existing catalogue entry rather than offering a duplicate', () => {
    // Typing "react" when React is listed must select it, not create a second
    // row the server would silently resolve back to the same skill.
    const result = resolveTypedSkill(CATALOGUE, 'react');
    expect(result.kind).toBe('existing');
    if (result.kind === 'existing') expect(result.skill.id).toBe(1);
  });

  it('matches on the slug too, so punctuation does not create a duplicate', () => {
    const catalogue = [skill(9, 'react-js', 'framework')];
    const result = resolveTypedSkill(catalogue, 'React.js');
    expect(result.kind).toBe('existing');
  });

  it('offers a genuinely new name', () => {
    const result = resolveTypedSkill(CATALOGUE, 'Rust');
    expect(result.kind).toBe('new');
    if (result.kind === 'new') expect(result.name).toBe('Rust');
  });

  it('trims the name it hands back', () => {
    const result = resolveTypedSkill(CATALOGUE, '  Rust  ');
    if (result.kind === 'new') expect(result.name).toBe('Rust');
  });
});
