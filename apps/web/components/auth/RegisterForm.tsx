'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, Label } from '@jobportal/ui';
import { ApiError, apiErrorMessage } from '../../lib/auth/api-error';
import { CountryCodeSelect } from '../ui/CountryCodeSelect';
import { DEFAULT_COUNTRY_ISO } from '../../lib/phone/countries';
import { joinPhone } from '../../lib/phone/format';
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
const SIGNUP_STORAGE_KEY = 'cq.signup.otp';

function rememberSignup(signupId: string, email: string): void {
  try {
    window.sessionStorage.setItem(SIGNUP_STORAGE_KEY, JSON.stringify({ signupId, email }));
  } catch {
    // Non-fatal: see the restore effect.
  }
}

function forgetSignup(): void {
  try {
    window.sessionStorage.removeItem(SIGNUP_STORAGE_KEY);
  } catch {
    // Non-fatal: see the restore effect.
  }
}

export function RegisterForm({ onSuccess, idPrefix = 'register' }: RegisterFormProps) {
  const router = useRouter();
  const [step, setStep] = useState<Step>('details');

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  // The dial code is a separate control, so the number field holds only the
  // NATIONAL part; joinPhone puts them back together at submit time.
  const [phoneIso, setPhoneIso] = useState(DEFAULT_COUNTRY_ISO);

  const [signupId, setSignupId] = useState('');
  // Which address the handle above was issued for. Sending it alongside a
  // DIFFERENT address would re-point that challenge, which the server allows
  // (it is the caller's own row) but which silently invalidates the code
  // already sitting in the first inbox.
  const [signupIdEmail, setSignupIdEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  const codeRef = useRef<HTMLInputElement>(null);

  // The signupId is the handle to a live challenge and it lived only in React
  // state, so a reload — or Back out of the flow and in again — minted a SECOND
  // challenge for the same address. That was merely wasteful before; with the
  // per-IP sub-cap in SignupOtpService it means the user's own abandoned row
  // locks them out of their own signup. sessionStorage rather than
  // localStorage: the handle should live exactly as long as the tab that owns
  // it, and not persist on a shared machine after the tab is closed.
  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(SIGNUP_STORAGE_KEY);
      if (!raw) return;
      const saved: unknown = JSON.parse(raw);
      if (saved && typeof saved === 'object') {
        const { signupId: id, email: addr } = saved as Record<string, unknown>;
        if (typeof id === 'string' && typeof addr === 'string') {
          setSignupId(id);
          setSignupIdEmail(addr);
          setEmail(addr);
        }
      }
    } catch {
      // Private mode, a full quota, or a corrupt value must never stop someone
      // signing up — a lost handle just costs one extra challenge.
    }
  }, []);

  // Counts down from the DURATION the server sends (`resendInSeconds`) plus
  // time elapsed locally on this device. Deliberately NOT
  // `Date.parse(serverInstant) - Date.now()`: that subtracts the device clock
  // from the server's, so the whole skew lands in the seed value. A phone
  // minutes out of true — ordinary on Android in India — then shows either a
  // resend that never unlocks, or one that appears unlocked immediately and
  // 429s on every press. Doing the subtraction once rather than per tick does
  // not remove the skew; sending a duration does.
  const startResendCountdown = useCallback((seconds: unknown) => {
    const n = typeof seconds === 'number' ? seconds : Number.NaN;
    setResendIn(Number.isFinite(n) && n > 0 ? Math.ceil(n) : 0);
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
    // Carry the parsed body on the error, not just its message. The cooldown
    // 429 is the response that re-arms the Resend button, and flattening it to
    // a string threw away the `resendInSeconds` it exists to deliver — leaving
    // the button permanently enabled and every press failing.
    if (!res.ok) throw new ApiError(apiErrorMessage(parsed, 'Something went wrong'), parsed);
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
      const reusable = signupId && signupIdEmail === email.trim().toLowerCase();
      const out = await post('/auth/signup/otp/request', {
        email,
        name,
        ...(reusable ? { signupId } : {}),
      });
      if (typeof out.signupId === 'string') {
        setSignupId(out.signupId);
        setSignupIdEmail(email.trim().toLowerCase());
        rememberSignup(out.signupId, email.trim().toLowerCase());
      }
      startResendCountdown(out.resendInSeconds);
      setStep('code');
      setNotice(`We sent a 6-digit code to ${email}.`);
    } catch (err) {
      // A cooldown 429 is not a dead end: it tells us exactly how long is left,
      // so re-arm the countdown from it instead of stranding the button.
      if (err instanceof ApiError) startResendCountdown(err.body.resendInSeconds);
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
        // An empty number omits `phone` entirely rather than sending a bare
        // "+91", which is not a phone number and would fail the API's min(7).
        ...(joinPhone(phoneIso, phone) ? { phone: joinPhone(phoneIso, phone) } : {}),
      });
      // The challenge was consumed server-side inside the register
      // transaction, so the stored handle is now dead — leaving it behind would
      // have the next signup in this tab present an already-spent id.
      forgetSignup();
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
        <Label htmlFor={phoneId} id={`${phoneId}-label`}>
          {/* fg-subtle measures 2.57:1 and is banned for meaningful text. */}
          Phone <span className="text-[var(--color-fg-muted)]">(optional)</span>
        </Label>
        <div className="flex gap-2">
          <CountryCodeSelect
            value={phoneIso}
            onChange={setPhoneIso}
            ariaLabelledBy={`${phoneId}-label`}
          />
          {/* autoComplete narrows from `tel` to `tel-national`: the country part
              now lives in its own control, so letting the browser autofill a
              full international number here would double the dial code. */}
          <Input
            id={phoneId}
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
      </div>
      {feedback}
      <Button type="submit" loading={loading} className="w-full">
        Create account
      </Button>
    </form>
  );
}
