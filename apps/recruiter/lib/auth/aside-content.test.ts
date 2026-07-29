import { describe, expect, it } from 'vitest';
import {
  ASIDE_CONTENT,
  ASIDE_KEYS,
  type AsideIcon,
  type AsideIllustration,
  type AsideKey,
} from './aside-content';

const VALID_ICONS: readonly AsideIcon[] = ['briefcase', 'users', 'shield', 'trend'];
const VALID_ILLUSTRATIONS: readonly AsideIllustration[] = ['pipeline', 'post-job'];

const panels = ASIDE_KEYS.map((key: AsideKey) => [key, ASIDE_CONTENT[key]] as const);

describe('aside panels', () => {
  it('exposes exactly the three panels the pages import', () => {
    expect(ASIDE_KEYS).toEqual(['login', 'register', 'brand']);
    for (const key of ASIDE_KEYS) expect(ASIDE_CONTENT[key]).toBeDefined();
  });

  it('sign-in and sign-up read differently — the whole point of per-page panels', () => {
    expect(ASIDE_CONTENT.login.headline).not.toBe(ASIDE_CONTENT.register.headline);
    expect(ASIDE_CONTENT.login.body).not.toBe(ASIDE_CONTENT.register.body);
    expect(ASIDE_CONTENT.login.illustration).not.toBe(ASIDE_CONTENT.register.illustration);
  });

  it('the fallback panel is not the sign-up pitch', () => {
    // /accept-invite and /verify-email are not sign-ups; showing "Start hiring
    // on Career Queue" to someone joining an existing company would be wrong.
    expect(ASIDE_CONTENT.brand.headline).not.toBe(ASIDE_CONTENT.register.headline);
  });
});

describe('panel content invariants', () => {
  it.each(panels)('%s has copy in all three slots', (_key, content) => {
    expect(content.eyebrow.trim().length).toBeGreaterThan(0);
    expect(content.headline.trim().length).toBeGreaterThan(0);
    expect(content.body.trim().length).toBeGreaterThan(0);
  });

  it.each(panels)('%s has exactly three points, so the panel height stays stable', (_key, content) => {
    expect(content.points).toHaveLength(3);
    for (const point of content.points) {
      expect(point.label.trim().length).toBeGreaterThan(0);
    }
  });

  it.each(panels)('%s uses only icon keys AuthAside can render', (_key, content) => {
    // A typo here would render nothing at all — the icon lookup is a record
    // access, not a component reference the compiler can check.
    for (const point of content.points) {
      expect(VALID_ICONS).toContain(point.icon);
    }
  });

  it.each(panels)('%s uses an illustration that exists', (_key, content) => {
    expect(VALID_ILLUSTRATIONS).toContain(content.illustration);
  });

  it.each(panels)('%s has no duplicate point labels', (_key, content) => {
    const labels = content.points.map((p) => p.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it.each(panels)('%s keeps the headline short enough for the 15ch column', (_key, content) => {
    // The panel sets max-w-[15ch] at 30-36px; much beyond this and the headline
    // pushes the illustration far enough down to force page scroll.
    expect(content.headline.length).toBeLessThanOrEqual(40);
  });
});
