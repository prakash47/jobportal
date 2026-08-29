import { describe, expect, it } from 'vitest';
import {
  COUNTRIES,
  DEFAULT_COUNTRY_ISO,
  FLAG_COLS,
  FLAG_ROWS,
  countryByIso,
  searchCountries,
} from './countries';

// countries.ts is GENERATED (scripts/build-flag-sprite.mjs), and the sprite
// offsets in it must stay in lockstep with public/flags.webp. These are the
// invariants a bad regeneration would break — the kind of thing that otherwise
// surfaces as "some flags show the wrong country", which no type can catch.

describe('country data invariants', () => {
  it('has India as the default the owner asked for', () => {
    expect(DEFAULT_COUNTRY_ISO).toBe('IN');
    const india = countryByIso('IN');
    expect(india[1]).toBe('India');
    expect(india[2]).toBe('+91');
  });

  it('gives every country a well-formed dial code', () => {
    for (const [iso, name, dial] of COUNTRIES) {
      // 1-4 digits: +1 (NANP) through +1876 (Jamaica). A shorter or longer
      // value means the generator mis-split world-countries' `idd`, which it
      // did for Åland (+35818) and Saint Helena (+2) before the fix.
      expect(dial, `${iso} ${name}`).toMatch(/^\+\d{1,4}$/);
    }
  });

  it('gives every country a distinct sprite cell inside the sheet', () => {
    const cells = new Set<string>();
    for (const [iso, , , col, row] of COUNTRIES) {
      expect(col, iso).toBeGreaterThanOrEqual(0);
      expect(col, iso).toBeLessThan(FLAG_COLS);
      expect(row, iso).toBeGreaterThanOrEqual(0);
      expect(row, iso).toBeLessThan(FLAG_ROWS);
      cells.add(`${col},${row}`);
    }
    // A duplicate cell means two countries share one flag image.
    expect(cells.size).toBe(COUNTRIES.length);
  });

  it('has unique ISO codes', () => {
    const isos = new Set(COUNTRIES.map((c) => c[0]));
    expect(isos.size).toBe(COUNTRIES.length);
  });

  it('is sorted by name, which is the order the list renders in', () => {
    const names = COUNTRIES.map((c) => c[1]);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'en')));
  });
});

describe('searchCountries', () => {
  it('matches a name prefix', () => {
    expect(searchCountries('indi').map((c) => c[0])).toContain('IN');
  });

  it('matches an interior word, not just the first', () => {
    expect(searchCountries('arab').map((c) => c[0])).toContain('AE');
  });

  it('matches the ISO code and the dial code, with or without the plus', () => {
    expect(searchCountries('IN').map((c) => c[0])).toContain('IN');
    expect(searchCountries('91').map((c) => c[0])).toContain('IN');
    expect(searchCountries('+91').map((c) => c[0])).toContain('IN');
  });

  it('returns everything for an empty query and nothing for nonsense', () => {
    expect(searchCountries('  ')).toHaveLength(COUNTRIES.length);
    expect(searchCountries('zzzzz')).toHaveLength(0);
  });
});

describe('countryByIso', () => {
  it('falls back to the default rather than returning null', () => {
    expect(countryByIso('ZZ')[0]).toBe(DEFAULT_COUNTRY_ISO);
  });

  it('is case-insensitive', () => {
    expect(countryByIso('ae')[0]).toBe('AE');
  });
});
