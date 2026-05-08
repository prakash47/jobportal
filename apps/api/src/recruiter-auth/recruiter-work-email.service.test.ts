import { BadRequestException } from '@nestjs/common';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';

vi.mock('@jobportal/db', () => ({
  prisma: {
    recruiter: { update: vi.fn() },
  },
}));

import { prisma } from '@jobportal/db';
import { RecruiterWorkEmailService } from './recruiter-work-email.service';

const mocked = prisma as unknown as {
  recruiter: { update: ReturnType<typeof vi.fn> };
};

const fakeEmail = {
  sendEmailVerification: vi.fn().mockResolvedValue(undefined),
} as { sendEmailVerification: ReturnType<typeof vi.fn> };

const ACCESS_SECRET = 'test-secret';
const NAMESPACED = `${ACCESS_SECRET}:recruiter-work-email`;

beforeAll(() => {
  process.env['JWT_ACCESS_SECRET'] = ACCESS_SECRET;
  process.env['RECRUITER_URL'] = 'http://localhost:3001';
});

afterAll(() => {
  delete process.env['JWT_ACCESS_SECRET'];
  delete process.env['RECRUITER_URL'];
});

describe('RecruiterWorkEmailService', () => {
  let service: RecruiterWorkEmailService;

  beforeEach(() => {
    vi.resetAllMocks();
    service = new RecruiterWorkEmailService(fakeEmail as unknown as never);
    mocked.recruiter.update.mockResolvedValue({ id: 99, workEmailVerified: true });
  });

  it('issueAndSend emits a token URL pointing at /verify-email/<token>', async () => {
    await service.issueAndSend(99, 'anjali@acme.com');
    expect(fakeEmail.sendEmailVerification).toHaveBeenCalledTimes(1);
    const [to, url] = fakeEmail.sendEmailVerification.mock.calls[0]!;
    expect(to).toBe('anjali@acme.com');
    expect(url).toMatch(/^http:\/\/localhost:3001\/verify-email\//);
  });

  it('verify happy path flips workEmailVerified=true and returns the recruiterId', async () => {
    const token = jwt.sign({ sub: 99, purpose: 'recruiter-work-email' }, NAMESPACED, {
      algorithm: 'HS256',
      expiresIn: 3600,
    });
    const out = await service.verify(token);
    expect(out).toEqual({ recruiterId: 99 });
    expect(mocked.recruiter.update).toHaveBeenCalledWith({
      where: { id: 99 },
      data: { workEmailVerified: true },
    });
  });

  it('rejects a token with the wrong purpose', async () => {
    const token = jwt.sign({ sub: 99, purpose: 'something-else' }, NAMESPACED, {
      algorithm: 'HS256',
      expiresIn: 3600,
    });
    await expect(service.verify(token)).rejects.toBeInstanceOf(BadRequestException);
    expect(mocked.recruiter.update).not.toHaveBeenCalled();
  });

  it('rejects a token signed with the unnamespaced JWT_ACCESS_SECRET (defense-in-depth)', async () => {
    // An access token signed with the bare access secret would have a
    // different claim set anyway, but a hand-rolled forgery using the bare
    // secret should also be rejected because we sign with `${secret}:recruiter-work-email`.
    const token = jwt.sign({ sub: 99, purpose: 'recruiter-work-email' }, ACCESS_SECRET, {
      algorithm: 'HS256',
      expiresIn: 3600,
    });
    await expect(service.verify(token)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an expired token', async () => {
    const token = jwt.sign({ sub: 99, purpose: 'recruiter-work-email' }, NAMESPACED, {
      algorithm: 'HS256',
      expiresIn: '-1s',
    });
    await expect(service.verify(token)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a malformed payload (sub is not numeric)', async () => {
    const token = jwt.sign({ sub: 'not-a-number', purpose: 'recruiter-work-email' }, NAMESPACED, {
      algorithm: 'HS256',
      expiresIn: 3600,
    });
    await expect(service.verify(token)).rejects.toBeInstanceOf(BadRequestException);
  });
});
