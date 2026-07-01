import { describe, expect, it } from 'vitest';
import { ChangePasswordDto } from './dto';

describe('ChangePasswordDto', () => {
  it('accepts a strong, different new password', () => {
    const parsed = ChangePasswordDto.safeParse({
      currentPassword: 'OldPass1!',
      newPassword: 'NewPass1!',
    });
    expect(parsed.success).toBe(true);
  });

  it('requires a non-empty current password', () => {
    const parsed = ChangePasswordDto.safeParse({
      currentPassword: '',
      newPassword: 'NewPass1!',
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects a weak new password (no digit / special / too short)', () => {
    for (const newPassword of ['short1!', 'nodigits!!', 'noSpecial123', 'password']) {
      const parsed = ChangePasswordDto.safeParse({ currentPassword: 'OldPass1!', newPassword });
      expect(parsed.success).toBe(false);
    }
  });

  it('rejects when the new password equals the current one', () => {
    const parsed = ChangePasswordDto.safeParse({
      currentPassword: 'SamePass1!',
      newPassword: 'SamePass1!',
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      // The refine attaches the issue to newPassword for field-level display.
      expect(parsed.error.issues.some((i) => i.path.includes('newPassword'))).toBe(true);
    }
  });
});
