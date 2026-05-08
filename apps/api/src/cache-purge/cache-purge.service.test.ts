import { describe, expect, it } from 'vitest';
import { pathsForFlag } from './cache-purge.service';

describe('pathsForFlag', () => {
  it('services.menu.visible → homepage (header rendered everywhere)', () => {
    expect(pathsForFlag('services.menu.visible')).toEqual(['/']);
  });

  it('subscription.pricing_page.visible → /pricing only', () => {
    expect(pathsForFlag('subscription.pricing_page.visible')).toEqual(['/pricing']);
  });

  it('subscription.system.enabled → / + /pricing (both can change shape)', () => {
    expect(pathsForFlag('subscription.system.enabled')).toEqual(['/', '/pricing']);
  });

  it('per-service flags map to /services index + the specific service page', () => {
    expect(pathsForFlag('services.resume_writing.enabled')).toEqual([
      '/services',
      '/services/resume-writing',
    ]);
    expect(pathsForFlag('services.ai_interview.enabled')).toEqual([
      '/services',
      '/services/ai-interview',
    ]);
  });

  it('unknown flag falls back to homepage (defensive default)', () => {
    expect(pathsForFlag('experiment.something.brand_new')).toEqual(['/']);
    expect(pathsForFlag('killswitch.transactional_emails')).toEqual(['/']);
    expect(pathsForFlag('feature.unlimited_applications')).toEqual(['/']);
  });
});
