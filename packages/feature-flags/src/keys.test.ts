import { describe, expect, it } from 'vitest';
import { CRITICAL_FLAGS, FLAG, isCriticalFlag } from './keys';

describe('isCriticalFlag', () => {
  it('any killswitch.* key is critical (prefix-based)', () => {
    expect(isCriticalFlag('killswitch.job_alerts')).toBe(true);
    expect(isCriticalFlag('killswitch.resume_uploads')).toBe(true);
    expect(isCriticalFlag('killswitch.new_registrations')).toBe(true);
    // killswitch.transactional_emails was added by feature/notifications-and-email
    // and was NOT in the old explicit list. Prefix matching catches it.
    expect(isCriticalFlag('killswitch.transactional_emails')).toBe(true);
    // A future killswitch added later inherits criticality automatically.
    expect(isCriticalFlag('killswitch.new_thing_we_dont_have_yet')).toBe(true);
  });

  it('the two cross-cutting non-killswitch flags are critical', () => {
    expect(isCriticalFlag(FLAG.SERVICES_MENU_VISIBLE)).toBe(true);
    expect(isCriticalFlag(FLAG.SUBSCRIPTION_SYSTEM)).toBe(true);
  });

  it('regular feature/services flags are NOT critical', () => {
    expect(isCriticalFlag(FLAG.FEAT_BULK_APPLY)).toBe(false);
    expect(isCriticalFlag(FLAG.SERVICES_RESUME_DISPLAY)).toBe(false);
    expect(isCriticalFlag(FLAG.PRICING_PAGE_VISIBLE)).toBe(false);
    expect(isCriticalFlag(FLAG.EXP_NEW_HOMEPAGE)).toBe(false);
  });

  it('a non-existent key starting with a non-killswitch prefix is not critical', () => {
    expect(isCriticalFlag('experiment.something')).toBe(false);
    expect(isCriticalFlag('killswitchish.foo')).toBe(false);
  });

  it('CRITICAL_FLAGS array includes the 3 seeded killswitches + 2 system flags', () => {
    expect(CRITICAL_FLAGS).toContain(FLAG.SERVICES_MENU_VISIBLE);
    expect(CRITICAL_FLAGS).toContain(FLAG.SUBSCRIPTION_SYSTEM);
    expect(CRITICAL_FLAGS).toContain(FLAG.KILL_JOB_ALERTS);
    expect(CRITICAL_FLAGS).toContain(FLAG.KILL_RESUME_UPLOADS);
    expect(CRITICAL_FLAGS).toContain(FLAG.KILL_NEW_REGISTRATIONS);
  });
});
