import { describe, expect, it } from 'vitest';
import { EMPLOYMENT_LABELS, WORK_MODE_LABELS, labelFor } from './format';

// `labelFor` exists because the SRP's active-filter chips resolve their emp and
// mode labels from a value taken straight off the URL. The bare `TABLE[value]`
// this replaced walked the prototype chain, so `/jobs?emp=__proto__` returned
// Object.prototype and React refused to render it — "Objects are not valid as a
// React child" — 500ing the page for an anonymous visitor on all four SRP
// surfaces. Reproduced live before the fix, and 200 after.
describe('labelFor', () => {
  it('returns the mapped label for a known key', () => {
    expect(labelFor(EMPLOYMENT_LABELS, 'FULL_TIME')).toBe('Full-time');
    expect(labelFor(EMPLOYMENT_LABELS, 'INTERN')).toBe('Internship');
    expect(labelFor(WORK_MODE_LABELS, 'ONSITE')).toBe('On-site');
  });

  it('falls back to the raw value for an unknown key', () => {
    expect(labelFor(EMPLOYMENT_LABELS, 'BOGUS')).toBe('BOGUS');
    expect(labelFor(WORK_MODE_LABELS, '')).toBe('');
  });

  it('does NOT resolve Object.prototype members', () => {
    for (const key of [
      '__proto__',
      'toString',
      'constructor',
      'valueOf',
      'hasOwnProperty',
      'isPrototypeOf',
      'propertyIsEnumerable',
      'toLocaleString',
    ]) {
      expect(labelFor(EMPLOYMENT_LABELS, key)).toBe(key);
      expect(labelFor(WORK_MODE_LABELS, key)).toBe(key);
    }
  });

  // The defect was not "wrong string" but "not a string at all" — that is what
  // React chokes on, so assert the runtime type rather than only the value.
  it('always returns a primitive string', () => {
    for (const key of ['__proto__', 'toString', 'constructor', 'FULL_TIME', 'BOGUS']) {
      expect(typeof labelFor(EMPLOYMENT_LABELS, key)).toBe('string');
    }
  });
});
