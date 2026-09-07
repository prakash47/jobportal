import { describe, expect, it } from 'vitest';
import { filterOptions, MAX_VISIBLE, type ComboboxOption } from './combobox-filter';

const CITIES: ComboboxOption[] = [
  { value: 'bengaluru', label: 'Bengaluru', hint: 'Karnataka' },
  { value: 'mumbai', label: 'Mumbai', hint: 'Maharashtra' },
  { value: 'pune', label: 'Pune', hint: 'Maharashtra' },
  { value: 'new-delhi', label: 'New Delhi', hint: 'Delhi' },
  { value: 'noida', label: 'Noida', hint: 'Uttar Pradesh' },
];

const labels = (options: ComboboxOption[]) => options.map((o) => o.label);

describe('filterOptions', () => {
  it('returns the head of the list when the query is empty', () => {
    expect(labels(filterOptions(CITIES, ''))).toEqual([
      'Bengaluru',
      'Mumbai',
      'Pune',
      'New Delhi',
      'Noida',
    ]);
    expect(filterOptions(CITIES, '   ')).toHaveLength(CITIES.length);
  });

  it('matches case-insensitively', () => {
    expect(labels(filterOptions(CITIES, 'MUMBAI'))).toEqual(['Mumbai']);
    expect(labels(filterOptions(CITIES, 'mum'))).toEqual(['Mumbai']);
  });

  it('ranks prefix matches above substring matches', () => {
    // "n" starts New Delhi and Noida, and appears inside Bengaluru and Pune.
    // Without the two-bucket ordering the alphabetical catalogue order would
    // surface Bengaluru first, which is not what someone typing "n" wants.
    const result = labels(filterOptions(CITIES, 'n'));
    expect(result.slice(0, 2)).toEqual(['New Delhi', 'Noida']);
    expect(result).toContain('Bengaluru');
  });

  it('searches the hint so a state name finds its cities', () => {
    expect(labels(filterOptions(CITIES, 'maharashtra'))).toEqual(['Mumbai', 'Pune']);
    expect(labels(filterOptions(CITIES, 'karnataka'))).toEqual(['Bengaluru']);
  });

  it('prefers a label match over a hint match for the same query', () => {
    // "Delhi" is New Delhi's label AND its state. It must appear once.
    const result = labels(filterOptions(CITIES, 'delhi'));
    expect(result).toEqual(['New Delhi']);
  });

  it('returns nothing when there is no match', () => {
    expect(filterOptions(CITIES, 'zzzz')).toEqual([]);
  });

  it('caps the rendered list at MAX_VISIBLE for empty and matching queries alike', () => {
    const many: ComboboxOption[] = Array.from({ length: 400 }, (_, i) => ({
      value: `skill-${i}`,
      label: `Skill ${i}`,
    }));
    expect(filterOptions(many, '')).toHaveLength(MAX_VISIBLE);
    expect(filterOptions(many, 'skill')).toHaveLength(MAX_VISIBLE);
  });

  it('stops walking the catalogue once the prefix bucket is full', () => {
    const many: ComboboxOption[] = Array.from({ length: 120 }, (_, i) => ({
      value: `a-${i}`,
      label: `Alpha ${i}`,
    }));
    expect(filterOptions(many, 'alpha')).toHaveLength(MAX_VISIBLE);
  });

  it('does not crash on options with no hint', () => {
    const noHint: ComboboxOption[] = [{ value: 'react', label: 'React' }];
    expect(labels(filterOptions(noHint, 'rea'))).toEqual(['React']);
    expect(filterOptions(noHint, 'karnataka')).toEqual([]);
  });
});
