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

  it('recruiter.plans_visible → no paths (recruiter-only surface, force-dynamic)', () => {
    // Must stay an explicit empty array, NOT the ['/'] default: this flag gates
    // the recruiter portal only and must never purge the job-seeker homepage.
    // Guards the `if (explicit)` truthiness path — [] is truthy, so the mapping
    // wins over the fallback.
    expect(pathsForFlag('recruiter.plans_visible')).toEqual([]);
  });

  it('admin-only killswitches purge nothing — never the seeker homepage', () => {
    // Every surface these three gate lives in apps/sadmin: behind auth, noindex,
    // and served by a different app than the Cloudflare-cached seeker site. The
    // defensive ['/'] default would evict the single most-trafficked path on the
    // site every time an operator toggled an admin switch, for a flag that
    // cannot change what that page renders.
    //
    // admin_job_delete had no entry until this was written and DID hit that
    // default — the assertion below is the regression, not a restatement.
    expect(pathsForFlag('killswitch.admin_subscription_write')).toEqual([]);
    expect(pathsForFlag('killswitch.admin_report_write')).toEqual([]);
    expect(pathsForFlag('killswitch.admin_job_delete')).toEqual([]);
  });

  it('the two report flags are distinct keys and both purge nothing', () => {
    // Opposite halves of one feature with opposite polarity — intake (seeded ON)
    // versus the admin queue (seeded OFF). They map to [] for DIFFERENT reasons:
    // the intake flag's only surface is /job/:slug, a per-posting path that
    // cannot be enumerated here; the admin flag's surfaces are not on this site
    // at all. If either ever resolves to ['/'] something has been renamed.
    expect(pathsForFlag('moderation.reports.enabled')).toEqual([]);
    expect(pathsForFlag('killswitch.admin_report_write')).toEqual([]);
  });

  it('unknown flag falls back to homepage (defensive default)', () => {
    expect(pathsForFlag('experiment.something.brand_new')).toEqual(['/']);
    expect(pathsForFlag('killswitch.transactional_emails')).toEqual(['/']);
    expect(pathsForFlag('feature.unlimited_applications')).toEqual(['/']);
  });
});
