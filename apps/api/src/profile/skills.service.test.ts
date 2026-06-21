import { describe, expect, it } from 'vitest';
import { slugifySkill } from './skills.service';

// slugifySkill maps a free-text skill name to a catalogue slug. The upsert in
// ProfileSkillsService.update keys on this, so a typed name that normalises to
// an existing catalogue slug dedupes onto it instead of creating a duplicate.
describe('slugifySkill', () => {
  it('lowercases and trims', () => {
    expect(slugifySkill('  React  ')).toBe('react');
  });

  it('collapses non-alphanumerics to single hyphens', () => {
    expect(slugifySkill('React.js')).toBe('react-js');
    expect(slugifySkill('Node   js')).toBe('node-js');
    expect(slugifySkill('C++ / C#')).toBe('c-c');
  });

  it('strips leading and trailing separators', () => {
    expect(slugifySkill('  ++GraphQL++  ')).toBe('graphql');
  });

  it('returns empty string when nothing usable remains', () => {
    expect(slugifySkill('   ')).toBe('');
    expect(slugifySkill('+++')).toBe('');
  });

  it('caps the slug length at 60 chars', () => {
    expect(slugifySkill('a'.repeat(100)).length).toBe(60);
  });
});
