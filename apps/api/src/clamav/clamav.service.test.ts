import { describe, expect, it } from 'vitest';
import { ClamAVService } from './clamav.service';

describe('ClamAVService (stub)', () => {
  const svc = new ClamAVService();

  it('returns CLEAN for normal filenames', async () => {
    expect(await svc.scan('cv.pdf', Buffer.from('hello'))).toBe('CLEAN');
    expect(await svc.scan('Prakash_Resume_2026.docx', Buffer.from('x'))).toBe('CLEAN');
  });

  it('returns INFECTED for the sentinel test name', async () => {
    expect(await svc.scan('__INFECTED_TEST__.pdf', Buffer.from('x'))).toBe('INFECTED');
  });
});
