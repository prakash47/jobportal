'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, Label } from '@jobportal/ui';
import { apiErrorMessage } from '../../lib/auth/api-error';
import { PasswordInput } from './PasswordInput';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/**
 * Raw --color-danger measures 4.41:1, which fails AA for body text. This is the
 * repo's theme-aware recipe (auth/FormError.tsx), measured at 6.39:1.
 */
const DANGER_TEXT = 'text-[color-mix(in_oklch,var(--color-danger),var(--color-fg)_30%)]';

export interface RegisterFormProps {
  /**
   * Called right after a successful registration so the popup can close itself.
   * Registration auto-logs-in; both the popup and the standalone page then
   * navigate to /onboarding (name prefilled + editable, email locked).
   */
  onSuccess?: () => void;
  /** Prefix for element ids so this form can coexist with the login form in the modal. */
  idPrefix?: string;
}

type Step = 'details' | 'code' | 'password';

/**
 * Shared registration form — three steps, because an account may not exist for
 * an address nobody can receive mail at.
 *
 * Registration used to accept any syntactically-valid address: `x@gmail.con`
 * created a real account and reported success. Malformed input was already
 * rejected, so no amount of extra validation would have helped — whether a
 * mailbox exists simply is not derivable from the text. The address is proven
 * by sending a code to it, and NO account exists until that code comes back
 * (SRS §4.12).
 *
 * Google sign-up skips all of this: Google has already verified the address, so
 * asking the user to prove it again would be theatre.
 */
export function RegisterForm({ onSuccess, idPrefix = 'register' }: RegisterFormProps) {
  const router = useRouter();
  const [step, setStep] = useState<Step>('details');

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');

  const [signupId, setSignupId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  const codeRef = useRef<HTMLInputElement>(null);

  // Countdown from a DURATION derived once at response time, never by comparing
  // the server's absolute timestamp against the device clock on every tick. A
  // phone whose clock is minutes out — common on Android in India — would
  // otherwise show a resend that never unlocks, or one that unlocks instantly.
  const startResendCountdown = useCallback((resendAvailableAt: string) => {
    const seconds = Math.max(0, Math.ceil((Date.parse(resendAvailableAt) - Date.now()) / 1000));
    setResendIn(Number.isFinite(seconds) ? seconds : 0);
  }, []);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  // Move focus to the code field when that step appears, so a keyboard or
  // screen-reader user is not left on a button that has just been replaced.
  useEffect(() => {
    if (step === 'code') codeRef.current?.focus();
  }, [step]);

  async function post(path: string, body: unknown): Promise<Record<string, unknown>> {
    const res = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const parsed = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) throw new Error(apiErrorMessage(parsed, 'Something went wrong'));
    return parsed;
  }

  async function sendCode(e?: React.FormEvent<HTMLFormElement>): Promise<void> {
    e?.preventDefault();
    setError(null);
    setNotice(null);
    setLoading(true);
    try {
      // Echo the existing signupId on a resend so the SAME challenge row is
      // replaced. Omitting it would mint a second live code for this address
      // and burn one of its three slots for no reason.
      const out = await post('/auth/signup/otp/request', {
        email,
        name,
        ...(signupId ? { signupId } : {}),
      });
      if (typeof out.signupId === 'string') setSignupId(out.signupId);
      if (typeof out.resendAvailableAt === 'string') startResendCountdown(out.resendAvailableAt);
      setStep('code');
      setNotice(`We sent a 6-digit code to ${email}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the code');
    } finally {
      setLoading(false);
    }
  }

  async function verifyCode(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setLoading(true);
    try {
      await post('/auth/signup/otp/verify', { signupId, code });
      setStep('password');
      setNotice('Email confirmed. Choose a password to finish.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not verify that code');
    } finally {
      setLoading(false);
    }
  }

  async function createAccount(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await post('/auth/register', {
        name,
        email,
        password,
        signupId,
        ...(phone ? { phone } : {}),
      });
      // Created AND auto-logged-in → straight to onboarding.
      onSuccess?.();
      router.push('/onboarding');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  const nameId = `${idPrefix}-name`;
  const emailId = `${idPrefix}-email`;
  const codeId = `${idPrefix}-code`;
  const passwordId = `${idPrefix}-password`;
  const phoneId = `${idPrefix}-phone`;

  const feedback = (
    <>
      {/* Both are live regions: the step changes without a navigation, so a
          screen-reader user gets no other signal that anything happened. */}
      {notice && (
        <p role="status" className="text-sm text-[var(--color-fg-muted)]">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className={`text-sm ${DANGER_TEXT}`}>
          {error}
        </p>
      )}
    </>
  );

  if (step === 'details') {
    return (
      <form onSubmit={sendCode} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor={nameId}>Name</Label>
          <Input
            id={nameId}
            type="text"
            autoComplete="name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={emailId}>Email</Label>
          <Input
            id={emailId}
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-describedby={`${emailId}-hint`}
          />
          <p id={`${emailId}-hint`} className="text-xs text-[var(--color-fg-muted)]">
            We’ll send a 6-digit code here to confirm it’s yours.
          </p>
        </div>
        {feedback}
        <Button type="submit" loading={loading} className="w-full">
          Send code
        </Button>
      </form>
    );
  }

  if (step === 'code') {
    return (
      <form onSubmit={verifyCode} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor={codeId}>6-digit code</Label>
          <Input
            id={codeId}
            ref={codeRef}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]{6}"
            maxLength={6}
            required
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            aria-describedby={`${codeId}-hint`}
          />
          <p id={`${codeId}-hint`} className="text-xs text-[var(--color-fg-muted)]">
            Sent to {email}. The code expires in 15 minutes.
          </p>
        </div>
        {feedback}
        <Button type="submit" loading={loading} className="w-full">
          Confirm email
        </Button>
        <div className="flex items-center justify-between text-xs">
          <button
            type="button"
            onClick={() => {
              // Back to step 1 WITHOUT clearing signupId: if they retype the
              // same address the existing challenge is reused rather than a
              // second one created.
              setStep('details');
              setError(null);
              setNotice(null);
            }}
            className="text-[var(--color-fg-muted)] underline underline-offset-2 hover:text-[var(--color-fg)]"
          >
            Use a different email
          </button>
          <button
            type="button"
            disabled={resendIn > 0 || loading}
            onClick={() => void sendCode()}
            className="text-[var(--color-fg-muted)] underline underline-offset-2 hover:text-[var(--color-fg)] disabled:no-underline disabled:opacity-60"
          >
            {resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend code'}
          </button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={createAccount} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor={passwordId}>Password</Label>
        <PasswordInput
          id={passwordId}
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-describedby={`${passwordId}-hint`}
        />
        <p id={`${passwordId}-hint`} className="text-xs text-[var(--color-fg-muted)]">
          8+ chars, must include a digit and a special character.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={phoneId}>
          {/* fg-subtle measures 2.57:1 and is banned for meaningful text. */}
          Phone <span className="text-[var(--color-fg-muted)]">(optional)</span>
        </Label>
        <Input
          id={phoneId}
          type="tel"
          autoComplete="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
      </div>
      {feedback}
      <Button type="submit" loading={loading} className="w-full">
        Create account
      </Button>
    </form>
  );
}
