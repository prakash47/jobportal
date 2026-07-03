import { describe, expect, it } from 'vitest';
import {
  ListContactMessagesQueryDto,
  ListTicketsQueryDto,
  StaffReplyDto,
  UpdateTicketStatusDto,
} from './dto';

describe('ListTicketsQueryDto', () => {
  it('accepts an empty query', () => {
    expect(ListTicketsQueryDto.safeParse({}).success).toBe(true);
  });

  it('coerces a numeric page string', () => {
    const r = ListTicketsQueryDto.safeParse({ page: '3' });
    expect(r.success && r.data.page).toBe(3);
  });

  it('rejects page < 1', () => {
    expect(ListTicketsQueryDto.safeParse({ page: '0' }).success).toBe(false);
  });

  it('rejects a non-numeric page', () => {
    expect(ListTicketsQueryDto.safeParse({ page: 'x' }).success).toBe(false);
  });

  it('accepts a valid status', () => {
    expect(ListTicketsQueryDto.safeParse({ status: 'IN_PROGRESS' }).success).toBe(true);
  });

  it('rejects an unknown status', () => {
    expect(ListTicketsQueryDto.safeParse({ status: 'PENDING' }).success).toBe(false);
  });

  it('rejects unknown keys', () => {
    expect(ListTicketsQueryDto.safeParse({ foo: 'bar' }).success).toBe(false);
  });
});

describe('UpdateTicketStatusDto', () => {
  it('accepts each valid status', () => {
    for (const status of ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']) {
      expect(UpdateTicketStatusDto.safeParse({ status }).success).toBe(true);
    }
  });

  it('rejects an unknown status', () => {
    expect(UpdateTicketStatusDto.safeParse({ status: 'ARCHIVED' }).success).toBe(false);
  });
});

describe('StaffReplyDto', () => {
  it('accepts a non-empty body', () => {
    expect(StaffReplyDto.safeParse({ body: 'on it' }).success).toBe(true);
  });

  it('rejects a whitespace-only body', () => {
    expect(StaffReplyDto.safeParse({ body: '  ' }).success).toBe(false);
  });
});

describe('ListContactMessagesQueryDto', () => {
  it('accepts an empty query and a page', () => {
    expect(ListContactMessagesQueryDto.safeParse({}).success).toBe(true);
    expect(ListContactMessagesQueryDto.safeParse({ page: '2' }).success).toBe(true);
  });

  it('rejects unknown keys', () => {
    expect(ListContactMessagesQueryDto.safeParse({ status: 'OPEN' }).success).toBe(false);
  });
});
