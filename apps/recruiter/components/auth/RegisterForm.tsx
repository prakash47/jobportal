'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, Label } from '@jobportal/ui';
import { FormError } from './FormError';
import { PasswordInput } from './PasswordInput';
import { VerifiableField, type SignupIdStore } from './VerifiableField';
import { toE164IndianMobile } from '../../lib/auth/phone';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

// The client island of /register. The page around it is a server component, so
// the brand panel and the static copy stay out of the client bundle.
//
// Signup now proves control of BOTH the email address and the mobile number
// before the account exists (SRS §4.9.1): each of those two fields is a
// VerifiableField that owns its own OTP state machine, and this form keeps only
// what the submit gate needs — the two values, the two verified flags, and the
// signup id the API keys the challenge rows on.
export function RegisterForm() {
  const router = useRouter();
  // useId() rather than hand-picked ids, per COLLABORATION.md §4.3. The hint
  // ids are what let the helper text be announced with its field rather than
  // read as loose prose after it.
  const nameId = useId();
  const passwordId = useId();
  const passwordHintId = useId();
  const companyId = useId();
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [emailVerified, setEmailVerified] = useState(false);
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // The signup id is a ref, not state: nothing renders it, and the field that
  // mints it has to read it back synchronously inside the same async handler.
  // `minting` is the mutual exclusion that stops both channels minting one each
  // — VerifiableField.sendCode explains what that would cost.
  const signupIdRef = useRef<string | null>(null);
  const signupIdMintingRef = useRef<Promise<void> | null>(null);
  const signupIdStore: SignupIdStore = { id: signupIdRef, minting: signupIdMintingRef };

  // Refs so verification can hand focus onward: email -> mobile -> password.
  // Owned here rather than inside the fields because the destination of each
  // move is the NEXT control, which only this form knows about.
  const nameInputRef = useRef<HTMLInputElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const phoneInputRef = useRef<HTMLInputElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const submitButtonRef = useRef<HTMLButtonElement>(null);
  const refocusSubmit = useRef(false);

  // The submit button disables itself while the request is in flight, which
  // drops focus to <body>. On success we navigate away, but on failure there is
  // nowhere else for a keyboard user to be, so focus is handed back once React
  // has re-enabled the button — which is why this is an effect and not a call
  // in the catch block, where the button is still disabled.
  useEffect(() => {
    if (!refocusSubmit.current) return;
    refocusSubmit.current = false;
    submitButtonRef.current?.focus();
  });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const signupId = signupIdStore.id.current;
    if (!emailVerified || !phoneVerified || signupId === null) {
      // Word-for-word the message the API returns when it re-checks the
      // challenge rows, so the recruiter never sees two different sentences for
      // the same requirement. The API is the enforcement point; this only saves
      // a round-trip.
      setError('Verify your email address and mobile number before creating your account.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/auth/recruiter/register`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          // Trimmed and lower-cased to match the `destination` stored on the
          // email challenge byte-for-byte; the API compares the two exactly.
          email: email.trim().toLowerCase(),
          // Same string the phone challenge was created with — see
          // lib/auth/phone.ts for why that has to come out of one function.
          phone: toE164IndianMobile(phone),
          signupId,
          password,
          name,
          companyName,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(body.message ?? 'Registration failed');
      }
      // Cookies are set by the API response. Both channels were proved before
      // the account existed, so there is no verify-email banner to land on —
      // straight to the dashboard.
      router.push('/dashboard');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
      refocusSubmit.current = true;
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-8 space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor={nameId}>Your name</Label>
        <Input
          ref={nameInputRef}
          id={nameId}
          required
          maxLength={120}
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      {/* Email and mobile come before the password on purpose: both need a
          round-trip to an inbox or a handset, so they are the fields worth
          starting early. */}
      <VerifiableField
        channel="EMAIL"
        label="Email ID"
        value={email}
        onValueChange={setEmail}
        name={name}
        signupIdStore={signupIdStore}
        verified={emailVerified}
        onVerifiedChange={setEmailVerified}
        inputRef={emailInputRef}
        onNameRequired={() => nameInputRef.current?.focus()}
        onVerifiedFocusNext={() => phoneInputRef.current?.focus()}
        formSubmitting={loading}
      />

      <VerifiableField
        channel="PHONE"
        label="Mobile number"
        value={phone}
        onValueChange={setPhone}
        name={name}
        signupIdStore={signupIdStore}
        verified={phoneVerified}
        onVerifiedChange={setPhoneVerified}
        inputRef={phoneInputRef}
        onNameRequired={() => nameInputRef.current?.focus()}
        onVerifiedFocusNext={() => passwordInputRef.current?.focus()}
        formSubmitting={loading}
      />

      <div className="space-y-1.5">
        <Label htmlFor={passwordId}>Password</Label>
        <PasswordInput
          ref={passwordInputRef}
          id={passwordId}
          autoComplete="new-password"
          required
          aria-describedby={passwordHintId}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <p id={passwordHintId} className="text-xs text-[var(--color-fg-muted)]">
          8+ characters, with one digit and one special character.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={companyId}>Company name</Label>
        <Input
          id={companyId}
          required
          maxLength={200}
          autoComplete="organization"
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
        />
      </div>

      {error && <FormError>{error}</FormError>}

      {/* The requirement is stated as standing copy and the button stays
          ENABLED. A button that is disabled for a reason living somewhere else
          on the page is the classic version of this control: it gives a
          keyboard or screen-reader user nothing to act on and no way to find
          out what is wrong. Pressing it with a channel unverified produces the
          message above, which is announced because FormError is a live region. */}
      <p className="text-xs text-[var(--color-fg-muted)]">
        Verify your email address and mobile number to enable account creation.
      </p>

      <Button ref={submitButtonRef} type="submit" loading={loading} size="lg" className="w-full">
        Create account
      </Button>
    </form>
  );
}
