import { describe, expect, it } from 'vitest';
import { hashPassword, isStrongPassword, verifyPassword } from './password';

describe('hashPassword + verifyPassword', () => {
  it('hashes to argon2id format', async () => {
    const hash = await hashPassword('Secret1!');
    expect(hash.startsWith('$argon2id$')).toBe(true);
  });

  it('verifies a correct password', async () => {
    const hash = await hashPassword('Secret1!');
    expect(await verifyPassword('Secret1!', hash)).toBe(true);
  });

  it('rejects an incorrect password', async () => {
    const hash = await hashPassword('Secret1!');
    expect(await verifyPassword('Wrong1!', hash)).toBe(false);
  });

  it('produces unique hashes for the same password (salt)', async () => {
    const a = await hashPassword('Secret1!');
    const b = await hashPassword('Secret1!');
    expect(a).not.toBe(b);
  });

  it('returns false on a malformed hash', async () => {
    expect(await verifyPassword('whatever', 'not-a-valid-hash')).toBe(false);
  });
});

describe('isStrongPassword', () => {
  it('accepts 8+ chars with digit and special', () => {
    expect(isStrongPassword('Secret1!')).toBe(true);
    expect(isStrongPassword('aaaaaaa1@')).toBe(true);
  });

  it('rejects too short', () => {
    expect(isStrongPassword('Sec1!')).toBe(false);
  });

  it('rejects no digit', () => {
    expect(isStrongPassword('Secret!!')).toBe(false);
  });

  it('rejects no special', () => {
    expect(isStrongPassword('Secret123')).toBe(false);
  });
});
