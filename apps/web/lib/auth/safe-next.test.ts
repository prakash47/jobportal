import { describe, expect, it } from 'vitest';
import { safeNext } from './safe-next';

describe('safeNext', () => {
  it('returns "/" for null/undefined/empty', () => {
    expect(safeNext(null)).toBe('/');
    expect(safeNext(undefined)).toBe('/');
    expect(safeNext('')).toBe('/');
  });

  it('passes through valid same-origin paths', () => {
    expect(safeNext('/job/foo-123')).toBe('/job/foo-123');
    expect(safeNext('/jobs?q=react')).toBe('/jobs?q=react');
    expect(safeNext('/')).toBe('/');
  });

  it('rejects protocol-relative URLs', () => {
    expect(safeNext('//evil.com')).toBe('/');
    expect(safeNext('//evil.com/job/foo-123')).toBe('/');
  });

  it('rejects absolute URLs', () => {
    expect(safeNext('https://evil.com')).toBe('/');
    expect(safeNext('http://evil.com')).toBe('/');
    expect(safeNext('javascript:alert(1)')).toBe('/');
  });

  it('rejects backslash variants', () => {
    expect(safeNext('/\\evil.com')).toBe('/');
    expect(safeNext('/\\\\evil.com')).toBe('/');
  });

  it('rejects paths that do not start with /', () => {
    expect(safeNext('jobs')).toBe('/');
    expect(safeNext('./jobs')).toBe('/');
    expect(safeNext('?next=/jobs')).toBe('/');
  });
});
