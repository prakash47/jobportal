import { describe, expect, it } from 'vitest';
import { DELETE_CONFIRMATION, DeleteAccountDto } from './dto';

describe('DeleteAccountDto', () => {
  it('accepts the exact confirmation phrase', () => {
    expect(DeleteAccountDto.safeParse({ confirm: 'DELETE' }).success).toBe(true);
  });

  // The wire value is the contract — the UI tells the user which word to type,
  // and both clients send that literal. Pinned as a literal rather than through
  // the constant, because importing it would let both sides move together and
  // leave this green while every client broke.
  it('pins the confirmation phrase', () => {
    expect(DELETE_CONFIRMATION).toBe('DELETE');
  });

  // The point of the phrase is that an accidental request cannot satisfy it, so
  // near-misses must be rejected rather than helpfully coerced.
  it.each(['delete', 'Delete', ' DELETE', 'DELETE ', 'DELETE ACCOUNT', '', 'yes'])(
    'rejects %o',
    (confirm) => {
      expect(DeleteAccountDto.safeParse({ confirm }).success).toBe(false);
    },
  );

  it('rejects a request with no body at all', () => {
    expect(DeleteAccountDto.safeParse({}).success).toBe(false);
    expect(DeleteAccountDto.safeParse(undefined).success).toBe(false);
    expect(DeleteAccountDto.safeParse(null).success).toBe(false);
  });

  // .strict() — an unexpected key means the caller is not sending what we think.
  it('rejects unknown keys', () => {
    expect(DeleteAccountDto.safeParse({ confirm: 'DELETE', userId: 1 }).success).toBe(false);
  });
});
