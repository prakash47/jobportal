'use client';

import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, Label, cn } from '@jobportal/ui';
import { ArrowRight, Check, Circle, Clock, Loader2, RotateCcw, ShieldCheck } from '@jobportal/ui/icons';
import { FormError } from './FormError';
import { LedgerStep, type StepState } from './LedgerStep';
import { OtpField, type OtpState } from './OtpField';
import { PasswordInput } from './PasswordInput';
import { PASSWORD_RULES, maskEmail, meetsPasswordRules } from '../../lib/auth/password-rules';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
// Cheap shape check only, so an obvious typo doesn't spend one of five sends.
// The API's Zod .email() stays the authority.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Mirrors RESET_TTL_MINUTES on the API. Only used if the response omits the
// duration — never to override what the server actually said.
const DEFAULT_CODE_TTL_SECONDS = 15 * 60;

type Phase = 1 | 2 | 3 | 4;
// One flag per request, so a resend can never render the code field as
// "verifying" or claim "Checking your code…" while a new code is being issued.
type Pending = null | 'send' | 'verify' | 'reset';

function mmss(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

// Countdowns are seeded from the server's DURATIONS and then decremented
// locally. Comparing a server timestamp against the device clock would put the
// flow at the mercy of that clock — a phone running an hour fast would call a
// freshly-issued code expired and lock the user out of a session the server
// considers live. Elapsed local time is unaffected by skew.
function countdownLabel(total: number): string {
  return total > 60 ? mmss(total) : `${total}s`;
}

async function postJson(path: string, body: unknown): Promise<{ ok: boolean; status: number; data: Record<string, unknown> }> {
  try {
    const res = await fetch(`${API_URL}${path}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: res.ok, status: res.status, data };
  } catch {
    // A rejected fetch (offline, DNS, CORS) must not leave a spinner running.
    return { ok: false, status: 0, data: {} };
  }
}

function apiMessage(data: Record<string, unknown>, fallback: string): string {
  const m = data['message'];
  if (typeof m === 'string') return m;
  // Zod issue arrays — surface the first message rather than "[object Object]".
  if (Array.isArray(m) && m.length > 0) {
    const first = m[0] as { message?: unknown };
    if (typeof first?.message === 'string') return first.message;
  }
  return fallback;
}

export function ResetLedger() {
  const router = useRouter();
  const uid = useId();

  const [phase, setPhase] = useState<Phase>(1);
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [code, setCode] = useState('');
  const [ticket, setTicket] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [visible, setVisible] = useState(false);

  const [pending, setPending] = useState<Pending>(null);
  const [error, setError] = useState<string | null>(null);
  // Seconds remaining, decremented locally (see countdownLabel). `null` means
  // "no code has been issued yet", which is distinct from zero.
  const [codeSecondsLeft, setCodeSecondsLeft] = useState<number | null>(null);
  const [resendSecondsLeft, setResendSecondsLeft] = useState(0);
  // A real send always returns a FRESH expiry (now + 15 min). If expiresAt does
  // not move forward across a resend, the server skipped the send — the only
  // signal available, since the response is deliberately identical either way.
  const lastExpiry = useRef<string | null>(null);
  const [resendNote, setResendNote] = useState('');

  const emailRef = useRef<HTMLInputElement>(null);
  const otpWrapRef = useRef<HTMLDivElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);
  const doneRef = useRef<HTMLHeadingElement>(null);

  // One ticking clock for both countdowns; only runs while they matter.
  useEffect(() => {
    if (phase !== 2) return;
    const t = setInterval(() => {
      setCodeSecondsLeft((s) => (s === null ? s : Math.max(0, s - 1)));
      setResendSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(t);
  }, [phase]);

  const busy = pending !== null;
  const codeDead = phase === 2 && codeSecondsLeft === 0;

  // Move focus into each newly-opened step. Without this, advancing dumps focus
  // on <body>: a keyboard user has to tab back in from the top of the document,
  // and a screen-reader user is told nothing at all. Skipped on first mount so
  // the email field's own autoFocus still wins.
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    const target =
      phase === 2
        ? otpWrapRef.current?.querySelector<HTMLInputElement>('input')
        : phase === 3
          ? passwordRef.current
          : phase === 4
            ? doneRef.current
            : emailRef.current;
    target?.focus();
  }, [phase]);

  const requestCode = useCallback(
    async (address: string, isResend: boolean) => {
      setPending('send');
      setError(null);
      setResendNote('');
      const res = await postJson('/auth/forgot-password', { email: address });
      setPending(null);

      if (!res.ok) {
        setError(
          res.status === 0
            ? 'We could not reach the server. Check your connection and try again.'
            : apiMessage(res.data, 'Something went wrong. Please try again.'),
        );
        return false;
      }

      const nextExpiry = typeof res.data['expiresAt'] === 'string' ? (res.data['expiresAt'] as string) : null;
      // Fall back to the documented TTL rather than 0 if the field is ever
      // missing. Zero would read as "already expired" and lock the user out of
      // a code the server considers perfectly live — and this countdown is only
      // advisory anyway: the server is the authority on expiry, and says so by
      // rejecting a stale code.
      const expiresIn =
        typeof res.data['expiresInSeconds'] === 'number'
          ? (res.data['expiresInSeconds'] as number)
          : DEFAULT_CODE_TTL_SECONDS;
      const resendIn =
        typeof res.data['resendInSeconds'] === 'number' ? (res.data['resendInSeconds'] as number) : 0;

      if (isResend && nextExpiry && lastExpiry.current === nextExpiry) {
        // Same expiry back — nothing was sent. Say so instead of implying a new
        // code is on its way.
        setResendNote('You already have a code in flight. Use the one we sent, or wait for it to expire.');
      } else if (isResend) {
        setResendNote('A new code is on its way.');
      }

      lastExpiry.current = nextExpiry;
      setCodeSecondsLeft(expiresIn);
      setResendSecondsLeft(resendIn);
      setSentTo(address);
      setCode('');
      return true;
    },
    [],
  );

  const onSubmitEmail = async (e: FormEvent) => {
    e.preventDefault();
    const address = email.trim().toLowerCase();
    if (!EMAIL_RE.test(address)) {
      setError('Enter a valid email address.');
      return;
    }
    if (await requestCode(address, false)) setPhase(2);
  };

  const verify = useCallback(
    async (value: string) => {
      if (value.length !== 6 || busy) return;
      setPending('verify');
      setError(null);
      const res = await postJson('/auth/verify-reset-otp', { email: sentTo, code: value });
      setPending(null);
      if (!res.ok) {
        setError(
          res.status === 0
            ? 'We could not reach the server. Check your connection and try again.'
            : apiMessage(res.data, 'That code is invalid or has expired. Request a new one.'),
        );
        return;
      }
      const t = res.data['ticket'];
      if (typeof t !== 'string') {
        setError('Something went wrong. Please try again.');
        return;
      }
      setTicket(t);
      setPhase(3);
    },
    [busy, sentTo],
  );

  const onSubmitPassword = async (e: FormEvent) => {
    e.preventDefault();
    if (!meetsPasswordRules(password)) {
      setError('Password must be at least 8 characters and include a number and a special character.');
      return;
    }
    if (password !== confirm) {
      setError('Both passwords must match.');
      return;
    }
    setPending('reset');
    setError(null);
    const res = await postJson('/auth/reset-password', { ticket, password });
    setPending(null);
    if (!res.ok) {
      setError(
        res.status === 0
          ? 'We could not reach the server. Check your connection and try again.'
          : apiMessage(res.data, 'This reset session has expired. Start again.'),
      );
      return;
    }
    setPhase(4);
    // The API set the session cookies; refresh so the server components pick
    // the signed-in state up, then land on the dashboard.
    router.refresh();
    router.push('/profile');
  };

  // Re-open step 1 with everything downstream cleared. The outstanding server
  // challenge is deliberately left alone: @@unique([userId]) means a resend
  // replaces the row in place, and restarting our own cooldown would promise a
  // send the API is about to skip.
  const editEmail = () => {
    setPhase(1);
    setCode('');
    setTicket('');
    setPassword('');
    setConfirm('');
    setError(null);
    setResendNote('');
    requestAnimationFrame(() => {
      emailRef.current?.focus();
      emailRef.current?.select();
    });
  };

  const stepState = (n: Phase): StepState => (phase > n ? 'done' : phase === n ? 'active' : 'pending');
  const otpState: OtpState =
    codeDead ? 'dead' : pending === 'verify' ? 'verifying' : error && phase === 2 ? 'error' : 'idle';

  return (
    <div className="w-full max-w-[30rem] rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-5 shadow-[var(--shadow-card)] sm:p-8">
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-[var(--color-fg-muted)]">
        <span aria-hidden="true" className="h-0.5 w-3 rounded-full bg-[var(--color-accent-600)]" />
        Password reset
      </p>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight text-[var(--color-fg)] sm:text-3xl">
        Reset your password
      </h1>
      <p className="mt-2 max-w-[34ch] text-sm text-[var(--color-fg-muted)]">
        Three quick steps. We’ll email you a 6-digit code to prove it’s you.
      </p>
      <hr className="-mx-5 my-6 border-t border-[var(--color-border)] sm:-mx-8" />

      {phase === 4 ? (
        <div className="py-2 text-center">
          <span
            aria-hidden="true"
            className="mx-auto grid size-12 place-items-center rounded-full bg-[var(--color-primary-600)]"
          >
            <Check className="size-6 text-[var(--color-accent-500)]" />
          </span>
          <h2
            ref={doneRef}
            tabIndex={-1}
            className="mt-4 text-lg font-semibold text-[var(--color-fg)] outline-none"
          >
            You’re signed in
          </h2>
          <p className="mt-1.5 text-sm text-[var(--color-fg-muted)]" role="status">
            Password updated. Every other device was signed out. Taking you to your dashboard…
          </p>
        </div>
      ) : (
        <ol className="list-none">
          {/* ---- 1 · email ---- */}
          <LedgerStep
            index={1}
            state={stepState(1)}
            headingId={`${uid}-s1`}
            pendingLabel="Your email"
            title="Verify your email"
            subtitle="We’ll send a 6-digit code to this address."
            summaryLabel="Email"
            summaryValue={maskEmail(sentTo || email)}
            onChange={editEmail}
          >
            <form onSubmit={onSubmitEmail} noValidate>
              <Label htmlFor={`${uid}-email`}>Email address</Label>
              <Input
                ref={emailRef}
                id={`${uid}-email`}
                type="email"
                inputMode="email"
                autoComplete="email"
                autoFocus
                required
                maxLength={254}
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError(null);
                }}
                readOnly={busy}
                invalid={Boolean(error)}
                aria-describedby={
                  error ? `${uid}-email-hint ${uid}-email-error` : `${uid}-email-hint`
                }
                className="mt-2 h-11 text-base"
              />
              <p id={`${uid}-email-hint`} className="mt-2 text-xs text-[var(--color-fg-muted)]">
                Use the address on your Career Queue account.
              </p>
              {error && (
                <div className="mt-3">
                  <FormError id={`${uid}-email-error`}>{error}</FormError>
                </div>
              )}
              {/* The icon goes through `trailingIcon`, NOT as a child: Button
                  wraps children in a <span>, and preflight makes svg
                  display:block, so an icon child breaks onto its own line. */}
              <Button
                type="submit"
                size="lg"
                loading={pending === 'send'}
                className="mt-5 w-full"
                trailingIcon={<ArrowRight aria-hidden="true" className="size-4 text-[var(--color-accent-500)]" />}
              >
                Send code
              </Button>
            </form>
          </LedgerStep>

          {/* ---- 2 · code ---- */}
          <LedgerStep
            index={2}
            state={stepState(2)}
            headingId={`${uid}-s2`}
            pendingLabel="Enter the code"
            title="Enter your code"
            summaryLabel="Code"
            summaryValue="Verified"
          >
            <p className="-mt-3 mb-4 text-sm text-[var(--color-fg-muted)]">
              If an account exists for{' '}
              <span className="font-medium text-[var(--color-fg)]">{maskEmail(sentTo)}</span>, a
              6-digit code is on its way. It expires in 15 minutes.
            </p>

            <div ref={otpWrapRef}>
              <OtpField
                value={code}
                onChange={(v) => {
                  setCode(v);
                  setError(null);
                }}
                onComplete={verify}
                state={otpState}
                // The error is chained on ONLY while it is on screen — pointing
                // at an absent id would leave the field describing nothing.
                describedBy={
                  error ? `${uid}-otp-status ${uid}-otp-error` : `${uid}-otp-status`
                }
              />
            </div>

            {/* Fixed height so nothing shifts under the digits — the CLS guarantee. */}
            <div id={`${uid}-otp-status`} className="mt-3 flex min-h-5 items-center gap-1.5 text-xs">
              {pending === 'verify' || pending === 'send' ? (
                <>
                  <Loader2 aria-hidden="true" className="size-3 animate-spin text-[var(--color-fg-muted)]" />
                  <span className="text-[var(--color-fg-muted)]">
                    {pending === 'send' ? 'Sending a new code…' : 'Checking your code…'}
                  </span>
                </>
              ) : codeDead ? (
                <span className="text-[color-mix(in_oklch,var(--color-danger),var(--color-fg)_30%)]">
                  That code has expired. Request a new one.
                </span>
              ) : codeSecondsLeft !== null ? (
                <>
                  <Clock aria-hidden="true" className="size-3 text-[var(--color-fg-muted)]" />
                  <span
                    className={cn(
                      'tabular-nums',
                      (codeSecondsLeft ?? 0) <= 60
                        ? 'text-[color-mix(in_oklch,var(--color-danger),var(--color-fg)_30%)]'
                        : 'text-[var(--color-fg-muted)]',
                    )}
                  >
                    Code expires in {mmss(codeSecondsLeft ?? 0)}
                  </span>
                </>
              ) : null}
            </div>

            {error && (
              <div className="mt-3">
                <FormError id={`${uid}-otp-error`}>{error}</FormError>
              </div>
            )}
            <p role="status" className="mt-3 min-h-4 text-xs text-[var(--color-fg-muted)]">
              {resendNote}
            </p>

            <Button
              type="button"
              size="lg"
              loading={pending === 'verify'}
              disabled={code.length !== 6 || codeDead || busy}
              onClick={() => verify(code)}
              className="mt-4 w-full"
              trailingIcon={<ArrowRight aria-hidden="true" className="size-4 text-[var(--color-accent-500)]" />}
            >
              Verify code
            </Button>

            <button
              type="button"
              onClick={() => requestCode(sentTo, true)}
              disabled={busy || resendSecondsLeft > 0}
              // min-h-11 (44px) so the one control that is routinely tapped on a
              // phone clears the touch floor; -mb-2 keeps the card's rhythm.
              className="-mb-2 mt-1 inline-flex min-h-11 items-center gap-1.5 text-xs text-[var(--color-fg-muted)] transition-colors hover:text-[var(--color-fg)] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:text-[var(--color-fg-muted)]"
            >
              <RotateCcw aria-hidden="true" className="size-3" />
              {resendSecondsLeft > 0 ? `Resend in ${countdownLabel(resendSecondsLeft)}` : 'Resend code'}
            </button>
          </LedgerStep>

          {/* ---- 3 · password ---- */}
          <LedgerStep
            index={3}
            state={stepState(3)}
            isLast
            headingId={`${uid}-s3`}
            pendingLabel="Set a new password"
            title="Set a new password"
            subtitle="Pick something you haven’t used here before."
            summaryLabel="Password"
            summaryValue="Updated"
          >
            <form onSubmit={onSubmitPassword} noValidate>
              {/* Without an associated identity Chrome and 1Password save the
                  new password against nothing. */}
              <input type="email" name="username" autoComplete="username" value={sentTo} readOnly hidden />

              <Label htmlFor={`${uid}-pw`}>New password</Label>
              <PasswordInput
                ref={passwordRef}
                id={`${uid}-pw`}
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError(null);
                }}
                visible={visible}
                onVisibleChange={setVisible}
                aria-describedby={error ? `${uid}-rules ${uid}-pw-error` : `${uid}-rules`}
                className="mt-2 h-11 text-base"
              />

              <ul id={`${uid}-rules`} className="mt-2.5 flex list-none flex-col gap-1.5">
                {PASSWORD_RULES.map((rule) => {
                  const met = rule.met(password);
                  return (
                    <li key={rule.id} className="flex items-center gap-2 text-xs">
                      {met ? (
                        <span
                          aria-hidden="true"
                          className="grid size-4 shrink-0 place-items-center rounded-[var(--radius-sm)] bg-[var(--color-primary-600)]"
                        >
                          <Check className="size-2.5 text-[var(--color-accent-500)]" />
                        </span>
                      ) : (
                        <Circle aria-hidden="true" className="size-4 shrink-0 text-[var(--color-fg-muted)]" />
                      )}
                      <span className={met ? 'text-[var(--color-fg)]' : 'text-[var(--color-fg-muted)]'}>
                        <span className="sr-only">{met ? 'Met: ' : 'Not met: '}</span>
                        {rule.label}
                      </span>
                    </li>
                  );
                })}
              </ul>

              <div className="mt-4">
                <Label htmlFor={`${uid}-pw2`}>Confirm new password</Label>
                <PasswordInput
                  id={`${uid}-pw2`}
                  autoComplete="new-password"
                  required
                  value={confirm}
                  onChange={(e) => {
                    setConfirm(e.target.value);
                    setError(null);
                  }}
                  visible={visible}
                  onVisibleChange={setVisible}
                  className="mt-2 h-11 text-base"
                />
              </div>

              {error && (
                <div className="mt-3">
                  <FormError id={`${uid}-pw-error`}>{error}</FormError>
                </div>
              )}

              <Button
                type="submit"
                size="lg"
                loading={pending === 'reset'}
                className="mt-5 w-full"
                trailingIcon={<ArrowRight aria-hidden="true" className="size-4 text-[var(--color-accent-500)]" />}
              >
                Set password and sign in
              </Button>
            </form>
          </LedgerStep>
        </ol>
      )}

      <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-xs text-[var(--color-fg-muted)]">
        <ShieldCheck aria-hidden="true" className="size-3" />
        Career Queue never asks for your password over email or phone.
      </p>
    </div>
  );
}
