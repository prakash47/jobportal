import { describe, expect, it } from 'vitest';
import {
  ASIDE_CONTENTS,
  normalizeAsidePath,
  resolveAsideContent,
  type AsideIcon,
  type AsideIllustration,
} from './aside-content';

const VALID_ICONS: readonly AsideIcon[] = ['briefcase', 'users', 'shield', 'trend'];
const VALID_ILLUSTRATIONS: readonly AsideIllustration[] = ['pipeline', 'post-job'];

describe('normalizeAsidePath', () => {
  it('passes a plain pathname through', () => {
    expect(normalizeAsidePath('/login')).toBe('/login');
  });

  it('strips a trailing slash', () => {
    expect(normalizeAsidePath('/login/')).toBe('/login');
    expect(normalizeAsidePath('/login///')).toBe('/login');
  });

  it('keeps the root path as-is rather than emptying it', () => {
    expect(normalizeAsidePath('/')).toBe('/');
  });

  it('lowercases', () => {
    expect(normalizeAsidePath('/Register')).toBe('/register');
  });

  it('drops a query string or hash', () => {
    expect(normalizeAsidePath('/login?next=%2Fdashboard')).toBe('/login');
    expect(normalizeAsidePath('/login#top')).toBe('/login');
  });

  it('returns empty for non-string input', () => {
    expect(normalizeAsidePath(null)).toBe('');
    expect(normalizeAsidePath(undefined)).toBe('');
  });
});

describe('resolveAsideContent', () => {
  it('gives the sign-in panel on /login', () => {
    const content = resolveAsideContent('/login');
    expect(content.eyebrow).toBe('Recruiter portal');
    expect(content.illustration).toBe('pipeline');
  });

  it('gives the sign-up panel on /register', () => {
    const content = resolveAsideContent('/register');
    expect(content.eyebrow).toBe('Create your account');
    expect(content.illustration).toBe('post-job');
  });

  it('sign-in and sign-up panels are distinct', () => {
    expect(resolveAsideContent('/login').headline).not.toBe(
      resolveAsideContent('/register').headline,
    );
  });

  it('falls back to the brand panel for the other routes in this group', () => {
    const fallback = resolveAsideContent('/verify-email/abc123');
    expect(fallback.headline).toBe('Hiring, without the clutter.');
    expect(resolveAsideContent('/accept-invite/tok')).toEqual(fallback);
  });

  it('falls back when the pathname header is absent', () => {
    // The layout renders with whatever headers() returns; a missing
    // x-canonical-pathname must still paint a complete panel.
    expect(resolveAsideContent(null).headline).toBe('Hiring, without the clutter.');
    expect(resolveAsideContent(undefined).headline).toBe('Hiring, without the clutter.');
    expect(resolveAsideContent('').headline).toBe('Hiring, without the clutter.');
  });

  it('matches exactly — a longer path that merely starts with a key falls back', () => {
    expect(resolveAsideContent('/loginx').headline).toBe('Hiring, without the clutter.');
    expect(resolveAsideContent('/login/extra').headline).toBe('Hiring, without the clutter.');
  });

  it('still resolves a trailing-slash or mixed-case pathname', () => {
    expect(resolveAsideContent('/login/').illustration).toBe('pipeline');
    expect(resolveAsideContent('/Register').illustration).toBe('post-job');
  });

  it('never returns undefined for arbitrary input', () => {
    for (const path of ['', '/', '//', '/x/y/z', '/LOGIN?a=b']) {
      expect(resolveAsideContent(path)).toBeDefined();
    }
  });
});

describe('panel content invariants', () => {
  it('every panel has copy in all three slots', () => {
    for (const content of ASIDE_CONTENTS) {
      expect(content.eyebrow.trim().length).toBeGreaterThan(0);
      expect(content.headline.trim().length).toBeGreaterThan(0);
      expect(content.body.trim().length).toBeGreaterThan(0);
    }
  });

  it('every panel has exactly three points, so the panel height stays stable', () => {
    for (const content of ASIDE_CONTENTS) {
      expect(content.points).toHaveLength(3);
      for (const point of content.points) {
        expect(point.label.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('every icon key maps to one AuthAside can render', () => {
    // A typo here would render nothing at all — the icon lookup is a record
    // access, not a component reference the compiler can check.
    for (const content of ASIDE_CONTENTS) {
      for (const point of content.points) {
        expect(VALID_ICONS).toContain(point.icon);
      }
    }
  });

  it('every illustration key maps to one that exists', () => {
    for (const content of ASIDE_CONTENTS) {
      expect(VALID_ILLUSTRATIONS).toContain(content.illustration);
    }
  });
});
