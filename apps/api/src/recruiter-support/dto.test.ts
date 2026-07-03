import { describe, expect, it } from 'vitest';
import { ContactMessageDto, CreateTicketDto, ReplyTicketDto } from './dto';

describe('CreateTicketDto', () => {
  const valid = { subject: 'Cannot publish', description: 'The publish button does nothing.', category: 'JOB_POSTING' };

  it('accepts a valid ticket', () => {
    const r = CreateTicketDto.safeParse(valid);
    expect(r.success).toBe(true);
  });

  it('trims subject and description', () => {
    const r = CreateTicketDto.safeParse({ ...valid, subject: '  Cannot publish  ' });
    expect(r.success && r.data.subject).toBe('Cannot publish');
  });

  it('rejects a too-short subject', () => {
    expect(CreateTicketDto.safeParse({ ...valid, subject: 'ab' }).success).toBe(false);
  });

  it('rejects a too-short description', () => {
    expect(CreateTicketDto.safeParse({ ...valid, description: 'short' }).success).toBe(false);
  });

  it('rejects an unknown category', () => {
    expect(CreateTicketDto.safeParse({ ...valid, category: 'PAYROLL' }).success).toBe(false);
  });

  it('rejects unknown keys (.strict)', () => {
    expect(CreateTicketDto.safeParse({ ...valid, priority: 'high' }).success).toBe(false);
  });

  it('rejects an over-long description', () => {
    expect(CreateTicketDto.safeParse({ ...valid, description: 'x'.repeat(5001) }).success).toBe(false);
  });
});

describe('ReplyTicketDto', () => {
  it('accepts a non-empty body', () => {
    expect(ReplyTicketDto.safeParse({ body: 'thanks' }).success).toBe(true);
  });

  it('rejects an empty / whitespace-only body', () => {
    expect(ReplyTicketDto.safeParse({ body: '   ' }).success).toBe(false);
  });

  it('rejects unknown keys', () => {
    expect(ReplyTicketDto.safeParse({ body: 'hi', fromSupport: true }).success).toBe(false);
  });
});

describe('ContactMessageDto', () => {
  const valid = { name: 'Ravi Kumar', email: 'Ravi@Acme.com', subject: 'Question', message: 'How do I export?' };

  it('accepts a valid message and lowercases the email', () => {
    const r = ContactMessageDto.safeParse(valid);
    expect(r.success && r.data.email).toBe('ravi@acme.com');
  });

  it('rejects an invalid email', () => {
    expect(ContactMessageDto.safeParse({ ...valid, email: 'not-an-email' }).success).toBe(false);
  });

  it('rejects a too-short name', () => {
    expect(ContactMessageDto.safeParse({ ...valid, name: 'R' }).success).toBe(false);
  });

  it('rejects a too-short message', () => {
    expect(ContactMessageDto.safeParse({ ...valid, message: 'short' }).success).toBe(false);
  });

  it('rejects unknown keys', () => {
    expect(ContactMessageDto.safeParse({ ...valid, phone: '123' }).success).toBe(false);
  });
});
