import { describe, expect, it } from 'vitest';
import {
  ListNotificationsQueryDto,
  UpdateRecruiterNotificationPreferencesDto,
} from './dto';

describe('UpdateRecruiterNotificationPreferencesDto', () => {
  it('accepts a single-toggle partial patch', () => {
    const r = UpdateRecruiterNotificationPreferencesDto.safeParse({ smsEnabled: true });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toEqual({ smsEnabled: true });
  });

  it('accepts both toggles', () => {
    const r = UpdateRecruiterNotificationPreferencesDto.safeParse({
      emailEnabled: false,
      smsEnabled: false,
    });
    expect(r.success).toBe(true);
  });

  it('accepts an empty object (no-op patch)', () => {
    expect(UpdateRecruiterNotificationPreferencesDto.safeParse({}).success).toBe(true);
  });

  it('rejects an unknown key (.strict)', () => {
    const r = UpdateRecruiterNotificationPreferencesDto.safeParse({ pushEnabled: true });
    expect(r.success).toBe(false);
  });

  it('rejects a non-boolean value', () => {
    const r = UpdateRecruiterNotificationPreferencesDto.safeParse({ emailEnabled: 'yes' });
    expect(r.success).toBe(false);
  });
});

describe('ListNotificationsQueryDto', () => {
  it('coerces a string page to a number', () => {
    const r = ListNotificationsQueryDto.safeParse({ page: '2' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.page).toBe(2);
  });

  it('accepts an absent page', () => {
    const r = ListNotificationsQueryDto.safeParse({});
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.page).toBeUndefined();
  });

  it('rejects a non-positive page', () => {
    expect(ListNotificationsQueryDto.safeParse({ page: '0' }).success).toBe(false);
    expect(ListNotificationsQueryDto.safeParse({ page: '-1' }).success).toBe(false);
  });

  it('rejects an unknown query key (.strict)', () => {
    expect(ListNotificationsQueryDto.safeParse({ page: '1', q: 'x' }).success).toBe(false);
  });
});
