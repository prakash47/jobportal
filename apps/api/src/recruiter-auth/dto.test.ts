import { describe, expect, it } from 'vitest';
import {
  ChangePasswordDto,
  RegisterRecruiterDto,
  RequestOtpDto,
  VerifyOtpDto,
  isValidOtpDestination,
} from './dto';

const SIGNUP_ID = 'a'.repeat(64);

const validRegister = {
  email: 'Me@Example.com',
  password: 'Sup3rSecret!',
  name: 'Anjali',
  companyName: 'Acme Inc',
  phone: '+91 98765 43210',
  signupId: SIGNUP_ID,
};

describe('RegisterRecruiterDto', () => {
  it('accepts a complete registration and lowercases the email', () => {
    const parsed = RegisterRecruiterDto.parse(validRegister);
    expect(parsed.email).toBe('me@example.com');
    expect(parsed.phone).toBe('+91 98765 43210');
    expect(parsed.signupId).toBe(SIGNUP_ID);
  });

  // Both are load-bearing now: without a phone there is nothing to bind the
  // PHONE challenge to, and without the signupId there is no pair to claim.
  it.each(['phone', 'signupId'] as const)('requires %s', (key) => {
    const { [key]: _dropped, ...rest } = validRegister;
    expect(RegisterRecruiterDto.safeParse(rest).success).toBe(false);
  });

  it.each(['call me', '12345', '+91 98765 43210 extension 4'])(
    'rejects the phone %p',
    (phone) => {
      expect(RegisterRecruiterDto.safeParse({ ...validRegister, phone }).success).toBe(false);
    },
  );

  // The client is not trusted to say it verified anything — these keys are
  // stripped, so the service can only ever read verification off the DB.
  it('strips any client-supplied verification flags', () => {
    const parsed = RegisterRecruiterDto.parse({
      ...validRegister,
      emailVerified: true,
      phoneVerified: true,
      otpVerified: true,
    });
    expect(parsed).not.toHaveProperty('emailVerified');
    expect(parsed).not.toHaveProperty('phoneVerified');
    expect(parsed).not.toHaveProperty('otpVerified');
  });
});

describe('RequestOtpDto', () => {
  it('accepts a first request with no signupId (the server mints one)', () => {
    const parsed = RequestOtpDto.safeParse({
      channel: 'EMAIL',
      destination: 'me@example.com',
      name: 'Anjali',
    });
    expect(parsed.success).toBe(true);
  });

  it('accepts a resend carrying the minted signupId', () => {
    const parsed = RequestOtpDto.safeParse({
      signupId: SIGNUP_ID,
      channel: 'PHONE',
      destination: '+91 98765 43210',
      name: 'Anjali',
    });
    expect(parsed.success).toBe(true);
  });

  // Shape is the SERVICE's job, so that killswitch.new_registrations can answer
  // 503 before anything tells the caller their address looks wrong.
  it('does not police the per-channel shape of destination', () => {
    const parsed = RequestOtpDto.safeParse({
      channel: 'EMAIL',
      destination: 'not-an-email',
      name: 'Anjali',
    });
    expect(parsed.success).toBe(true);
  });

  it.each(['SMS', 'WHATSAPP', 'email'])('rejects the channel %p', (channel) => {
    expect(
      RequestOtpDto.safeParse({ channel, destination: 'me@example.com', name: 'A' }).success,
    ).toBe(false);
  });

  it('requires a non-empty name for the sadmin "User name" column', () => {
    expect(
      RequestOtpDto.safeParse({ channel: 'EMAIL', destination: 'me@example.com', name: '' })
        .success,
    ).toBe(false);
  });

  it('rejects unknown keys', () => {
    expect(
      RequestOtpDto.safeParse({
        channel: 'EMAIL',
        destination: 'me@example.com',
        name: 'A',
        code: '123456',
      }).success,
    ).toBe(false);
  });
});

describe('VerifyOtpDto', () => {
  it('accepts a 6-digit code, leading zeros included', () => {
    const parsed = VerifyOtpDto.parse({
      signupId: SIGNUP_ID,
      channel: 'EMAIL',
      code: '000042',
    });
    // Stays a string — parsing it as a number would eat the zeros.
    expect(parsed.code).toBe('000042');
  });

  it.each(['12345', '1234567', '12345a', '', '  1234'])('rejects the code %p', (code) => {
    expect(VerifyOtpDto.safeParse({ signupId: SIGNUP_ID, channel: 'EMAIL', code }).success).toBe(
      false,
    );
  });

  it('requires a signupId (there is nothing to look the challenge up by without one)', () => {
    expect(VerifyOtpDto.safeParse({ channel: 'EMAIL', code: '123456' }).success).toBe(false);
  });

  it('rejects unknown keys', () => {
    expect(
      VerifyOtpDto.safeParse({
        signupId: SIGNUP_ID,
        channel: 'EMAIL',
        code: '123456',
        destination: 'me@example.com',
      }).success,
    ).toBe(false);
  });
});

describe('isValidOtpDestination', () => {
  it.each(['me@example.com', 'first.last+tag@sub.example.co.in'])('accepts the email %p', (v) => {
    expect(isValidOtpDestination('EMAIL', v)).toBe(true);
  });

  it.each(['not-an-email', 'a@b', 'me@example.com ', ''])('rejects the email %p', (v) => {
    expect(isValidOtpDestination('EMAIL', v)).toBe(false);
  });

  // Same rule as profile/dto.ts and recruiter-profile/dto.ts — a number that
  // verifies here must be one the recruiter can also save on their profile.
  it.each(['+91 98765 43210', '9876543210', '(022) 2345-6789'])(
    'accepts the phone %p',
    (v) => {
      expect(isValidOtpDestination('PHONE', v)).toBe(true);
    },
  );

  it.each(['12345', 'call me', '+91 98765 43210 x4', '9'.repeat(21)])(
    'rejects the phone %p',
    (v) => {
      expect(isValidOtpDestination('PHONE', v)).toBe(false);
    },
  );
});

describe('ChangePasswordDto', () => {
  it('accepts a strong, different new password', () => {
    const parsed = ChangePasswordDto.safeParse({
      currentPassword: 'OldPass1!',
      newPassword: 'NewPass1!',
    });
    expect(parsed.success).toBe(true);
  });

  it('requires a non-empty current password', () => {
    const parsed = ChangePasswordDto.safeParse({
      currentPassword: '',
      newPassword: 'NewPass1!',
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects a weak new password (no digit / special / too short)', () => {
    for (const newPassword of ['short1!', 'nodigits!!', 'noSpecial123', 'password']) {
      const parsed = ChangePasswordDto.safeParse({ currentPassword: 'OldPass1!', newPassword });
      expect(parsed.success).toBe(false);
    }
  });

  it('rejects when the new password equals the current one', () => {
    const parsed = ChangePasswordDto.safeParse({
      currentPassword: 'SamePass1!',
      newPassword: 'SamePass1!',
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      // The refine attaches the issue to newPassword for field-level display.
      expect(parsed.error.issues.some((i) => i.path.includes('newPassword'))).toBe(true);
    }
  });
});
