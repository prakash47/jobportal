import { ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { AuthController } from './auth.controller';

// Narrow on purpose: this file exists for the WIRING that service-level tests
// cannot see. `assertNewRegistrationsOpen` was already covered inside
// SignupOtpService, and it passed while /auth/register never called it at all —
// so an emergency stop on signups could be walked straight past by anyone
// already holding a verified challenge.

const signupOtp = {
  assertNewRegistrationsOpen: vi.fn(),
  assertVerifiedEmail: vi.fn(),
  consumeVerified: vi.fn(),
};
const auth = { register: vi.fn() };
const email = { enqueueRegistrationConfirmation: vi.fn().mockResolvedValue(undefined) };

const ctrl = new AuthController(
  auth as never,
  { issueAndSend: vi.fn() } as never,
  {} as never,
  email as never,
  signupOtp as never,
);

const body = {
  name: 'Test Seeker',
  email: 'seeker@example.com',
  password: 'Sup3rSecret!',
  signupId: 'a'.repeat(64),
};
const req = { ip: '1.2.3.4', headers: {} } as never;
const res = { cookie: vi.fn() } as never;

describe('AuthController.register — the killswitch covers account creation', () => {
  it('refuses while killswitch.new_registrations is on', async () => {
    vi.clearAllMocks();
    signupOtp.assertNewRegistrationsOpen.mockRejectedValue(
      new ServiceUnavailableException('New sign-ups are temporarily unavailable'),
    );

    await expect(ctrl.register(body, req, res)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    // and it stopped BEFORE spending the challenge or creating anything
    expect(signupOtp.assertVerifiedEmail).not.toHaveBeenCalled();
    expect(auth.register).not.toHaveBeenCalled();
  });

  it('checks the killswitch before the verified-email binding', async () => {
    vi.clearAllMocks();
    signupOtp.assertNewRegistrationsOpen.mockResolvedValue(undefined);
    signupOtp.assertVerifiedEmail.mockResolvedValue(undefined);
    email.enqueueRegistrationConfirmation.mockResolvedValue(undefined);
    auth.register.mockResolvedValue({
      user: { id: 7, email: body.email, name: body.name, role: 'CANDIDATE', emailVerified: true },
      accessToken: 'a',
      refreshToken: 'r',
    });

    await ctrl.register(body, req, res);

    expect(signupOtp.assertNewRegistrationsOpen.mock.invocationCallOrder[0]!).toBeLessThan(
      signupOtp.assertVerifiedEmail.mock.invocationCallOrder[0]!,
    );
    expect(signupOtp.assertVerifiedEmail).toHaveBeenCalledWith(body.signupId, body.email);
  });
});
