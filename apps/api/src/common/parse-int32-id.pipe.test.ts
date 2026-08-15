import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { ParseInt32IdPipe } from './parse-int32-id.pipe';

const pipe = new ParseInt32IdPipe();

describe('ParseInt32IdPipe', () => {
  it('parses an ordinary id', () => {
    expect(pipe.transform('42')).toBe(42);
  });

  it('accepts the int4 ceiling itself', () => {
    expect(pipe.transform('2147483647')).toBe(2_147_483_647);
  });

  // The regression this pipe was written for, found by firing this exact value
  // at the live PATCH /admin/billing/subscriptions/:id and getting a 500.
  // ParseIntPipe accepts it — it is a valid JS integer — and Prisma then THROWS
  // rather than returning no rows, because the column is int4.
  it('rejects an id above int4 instead of letting Prisma throw a 500', () => {
    expect(() => pipe.transform('99999999999')).toThrow(BadRequestException);
    expect(() => pipe.transform('2147483648')).toThrow(BadRequestException);
  });

  it.each(['0', '-1'])('rejects the non-positive id %s', (v) => {
    expect(() => pipe.transform(v)).toThrow(BadRequestException);
  });

  // Number() accepts hex and exponent notation, so without the digits-only test
  // these would resolve to real rows under non-canonical URLs.
  it.each(['0x1a', '1e1', '1.5', '', ' 7 ', 'abc', '+7'])(
    'rejects the non-canonical id %j',
    (v) => {
      expect(() => pipe.transform(v)).toThrow(BadRequestException);
    },
  );
});
