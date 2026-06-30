import { describe, expect, it } from 'vitest';
import { SaveKycDto, UploadKycDocumentDto } from './dto';

describe('SaveKycDto — GSTIN', () => {
  it('accepts a valid GSTIN', () => {
    const r = SaveKycDto.safeParse({ gstNumber: '27AAACA1234A1Z5' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.gstNumber).toBe('27AAACA1234A1Z5');
  });

  it('normalises a lowercase / padded GSTIN to canonical uppercase', () => {
    const r = SaveKycDto.safeParse({ gstNumber: '  27aaaca1234a1z5  ' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.gstNumber).toBe('27AAACA1234A1Z5');
  });

  it('rejects a malformed GSTIN', () => {
    expect(SaveKycDto.safeParse({ gstNumber: '27AAACA1234A1Z' }).success).toBe(false); // 14 chars
    expect(SaveKycDto.safeParse({ gstNumber: 'NOTAGSTIN' }).success).toBe(false);
  });

  it('allows an empty string (clears the field)', () => {
    const r = SaveKycDto.safeParse({ gstNumber: '' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.gstNumber).toBe('');
  });
});

describe('SaveKycDto — PAN', () => {
  it('accepts and normalises a PAN', () => {
    const r = SaveKycDto.safeParse({ panNumber: 'aaaca1234a' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.panNumber).toBe('AAACA1234A');
  });

  it('rejects a malformed PAN', () => {
    expect(SaveKycDto.safeParse({ panNumber: 'AAACA1234' }).success).toBe(false);
  });
});

describe('SaveKycDto — other fields', () => {
  it('accepts a known ID-proof type and rejects an unknown one', () => {
    expect(SaveKycDto.safeParse({ authorizedPersonIdType: 'PASSPORT' }).success).toBe(true);
    expect(SaveKycDto.safeParse({ authorizedPersonIdType: '' }).success).toBe(true);
    expect(SaveKycDto.safeParse({ authorizedPersonIdType: 'SOMETHING' }).success).toBe(false);
  });

  it('rejects unknown keys (strict)', () => {
    expect(SaveKycDto.safeParse({ notAField: 'x' }).success).toBe(false);
  });

  it('accepts an all-empty payload (a fresh draft)', () => {
    expect(SaveKycDto.safeParse({}).success).toBe(true);
  });
});

describe('UploadKycDocumentDto', () => {
  it('accepts the two valid doc types', () => {
    expect(UploadKycDocumentDto.safeParse({ docType: 'BUSINESS_REGISTRATION' }).success).toBe(true);
    expect(UploadKycDocumentDto.safeParse({ docType: 'AUTHORIZED_PERSON_ID' }).success).toBe(true);
  });

  it('rejects an unknown doc type', () => {
    expect(UploadKycDocumentDto.safeParse({ docType: 'SELFIE' }).success).toBe(false);
  });
});
