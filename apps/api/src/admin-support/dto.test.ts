import { describe, expect, it } from 'vitest';
import {
  AddNoteDto,
  ListContactMessagesQueryDto,
  ListTicketsQueryDto,
  StaffReplyDto,
  UpdateTicketStatusDto,
} from './dto';

describe('ListTicketsQueryDto — q', () => {
  it('trims and collapses internal whitespace', () => {
    const r = ListTicketsQueryDto.safeParse({ q: '  acme   corp  ' });
    expect(r.success && r.data.q).toBe('acme corp');
  });

  // The padded-input class this repo shipped a 500 for on the transactions
  // console: `.refine` validates a trimmed copy and passes the RAW value on.
  // This is a `.transform`, so what the service receives IS what was validated —
  // pinned by asserting the OUTPUT rather than just `success`.
  it('is a transform, not a refine — the parsed value is the normalized one', () => {
    const r = ListTicketsQueryDto.safeParse({ q: ' %acme ' });
    expect(r.success && r.data.q).toBe('%acme');
  });

  it('collapses an all-whitespace q to undefined so ?q= and no q are one state', () => {
    const r = ListTicketsQueryDto.safeParse({ q: '   ' });
    expect(r.success && r.data.q).toBeUndefined();
    const empty = ListTicketsQueryDto.safeParse({ q: '' });
    expect(empty.success && empty.data.q).toBeUndefined();
  });

  it('caps the needle at 100 characters', () => {
    const r = ListTicketsQueryDto.safeParse({ q: 'a'.repeat(250) });
    expect(r.success && r.data.q?.length).toBe(100);
  });

  it('rejects an absurdly long q outright rather than silently truncating it', () => {
    expect(ListTicketsQueryDto.safeParse({ q: 'a'.repeat(501) }).success).toBe(false);
  });

  it('composes with status and page', () => {
    const r = ListTicketsQueryDto.safeParse({ q: 'acme', status: 'OPEN', page: '2' });
    expect(r.success && r.data).toEqual({ q: 'acme', status: 'OPEN', page: 2 });
  });

  it('rejects an unknown key (strict)', () => {
    expect(ListTicketsQueryDto.safeParse({ q: 'a', nope: '1' }).success).toBe(false);
  });
});

describe('AddNoteDto', () => {
  it('accepts a note and trims it', () => {
    const r = AddNoteDto.safeParse({ body: '  chased the refund  ' });
    expect(r.success && r.data.body).toBe('chased the refund');
  });

  it('rejects an empty or whitespace-only note', () => {
    expect(AddNoteDto.safeParse({ body: '' }).success).toBe(false);
    expect(AddNoteDto.safeParse({ body: '   ' }).success).toBe(false);
  });

  it('rejects a note over 5000 characters', () => {
    expect(AddNoteDto.safeParse({ body: 'a'.repeat(5001) }).success).toBe(false);
  });

  it('rejects unknown keys — a note carries no status or visibility field', () => {
    expect(AddNoteDto.safeParse({ body: 'x', internal: false }).success).toBe(false);
  });
});

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
