'use client';

import { useEffect, useId, useRef, useState, type RefObject } from 'react';
import { Button, Input, Label, cn } from '@jobportal/ui';
import { Check } from '@jobportal/ui/icons';
import { FormError } from './FormError';
import { requestOtp, verifyOtp, type OtpChannel } from '../../lib/auth/otp-client';
import {
  INDIAN_MOBILE_DIGITS,
  INDIAN_MOBILE_INPUT_MAX_LENGTH,
  INDIA_CALLING_CODE,
  formatIndianMobile,
  isIndianMobile,
  normalizeIndianMobile,
  toE164IndianMobile,
} from '../../lib/auth/phone';

// One channel of the signup verification — render one for the email address and
// one for the mobile number. Each instance owns its own element ids, its own
// state machine, its own OTP sub-field and its own live regions, so RegisterForm
// is left holding only the value and the verified flag that its submit gate
// actually needs.
//
// HOW A CODE ACTUALLY REACHES THE REGISTRANT — every string in this file has to
// stay true to this. There is NO email or SMS provider wired to signup. The API
// only writes the challenge row; a Career Queue staff member reads the code off
// /sadmin/otp-sessions and relays it by phone call or WhatsApp. So nothing here
// may say "sent", "we'll email you" or "we'll text you": a registrant told to
// watch their inbox waits for something that is never going to arrive.
//
// App-local rather than a @jobportal/ui component, for the reason
// PasswordInput.tsx already documents: promoting it would take the atoms-barrel
// lock for something exactly one app uses. It composes the shared atoms instead.
//
// STATE MACHINE — `phase`, and what each state renders:
//   idle           Field + hint + a "Verify …" button. No code exists yet.
//                  Entered on mount, and again on every edit of the value.
//   requesting     A first request or a repeat request is in flight. The pressed
//                  button shows its spinner and is disabled; the value stays
//                  editable. On a REPEAT the code panel stays open — see
//                  `codePanelOpen`.
//   awaiting-code  The code panel is open — code input (focused on arrival),
//                  "Verify code", and a resend button that is disabled until the
//                  server's 30-second cooldown elapses.
//   verifying      The entered code is being checked. "Verify code" spins. The
//                  code input deliberately stays ENABLED so focus is not yanked
//                  out of it mid-check.
//   expired        The 15-minute window closed. The code input is disabled,
//                  "Verify code" is removed entirely (there is nothing left to
//                  verify, and a disabled button explains nothing), and the only
//                  offered action is "Request a new code".
//   verified       The panel is gone; a tick and the word "Verified" sit beside
//                  the label. Owned by the PARENT — see `phase` below.
//
// Orthogonal to the machine: `fieldError` (bad address, or a failed first send),
// `codeError` (wrong / expired / unsendable code) and `cooldown` (seconds left
// on the resend window). Any of them can coexist with any phase.

type UnverifiedPhase = 'idle' | 'requesting' | 'awaiting-code' | 'verifying' | 'expired';
type Phase = UnverifiedPhase | 'verified';

/** Where focus has to land once React has committed the next render. */
type FocusTarget = 'code' | 'request' | 'resend' | 'next';

/**
 * The signup id, shared by both channels and held in refs rather than state.
 *
 * Nothing renders it, and the two fields need to read and write it
 * synchronously in the middle of an async handler — a state prop would still be
 * a render behind at exactly the moment it matters.
 */
export interface SignupIdStore {
  /** Null until the API mints one on the first successful request. */
  id: RefObject<string | null>;
  /** The in-flight id-minting request, if one is running. See `sendCode`. */
  minting: RefObject<Promise<void> | null>;
}

export interface VerifiableFieldProps {
  channel: OtpChannel;
  /** Visible field label, e.g. "Email ID". */
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  /**
   * The registrant's name. The API stores it on the challenge row and the
   * sadmin OTP Sessions table leads with it — it is how the staff member
   * relaying a code knows whose signup they are looking at — so a code cannot
   * be requested without one. See the guard at the top of `sendCode`.
   */
  name: string;
  signupIdStore: SignupIdStore;
  verified: boolean;
  onVerifiedChange: (verified: boolean) => void;
  /**
   * Owned by the parent so the field above can move focus into this one; also
   * used here to focus the input when the typed value fails its shape check.
   */
  inputRef: RefObject<HTMLInputElement | null>;
  /**
   * Report that Verify was pressed with the name field empty. The parent owns
   * the Name input, so it is the only place that can put the message and the
   * `aria-invalid` on the control that is actually at fault (WCAG 3.3.1) and
   * move focus there. This field deliberately does not flag itself for it.
   */
  onNameRequired: () => void;
  /**
   * Move focus to the control after this field. Called once, from an effect,
   * after the code input has actually been removed from the DOM.
   */
  onVerifiedFocusNext: () => void;
  /** True while the registration itself is in flight. */
  formSubmitting: boolean;
}

/** Digits in an OTP. Mirrors the API's zero-padded 6-digit code. */
const CODE_LENGTH = 6;

/**
 * Copy only. Expiry itself is driven by the `expiresAt` the server returns —
 * this number just tells the recruiter roughly how long they have, and would be
 * wrong to compute anything from.
 */
const CODE_TTL_MINUTES = 15;

/**
 * A shape check, not a validator: the API's Zod `.email()` is the authority.
 * Its only job is to stop a request that would spend one of the five resends
 * the recruiter gets on an address with an obvious typo.
 */
const EMAIL_SHAPE_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Whole seconds until `iso`, floored at zero. An unparseable timestamp yields
 *  0 rather than a button that stays disabled forever. */
function secondsUntil(iso: string): number {
  const ms = Date.parse(iso) - Date.now();
  return Number.isFinite(ms) && ms > 0 ? Math.ceil(ms / 1000) : 0;
}

/** Epoch milliseconds, or null when the server sent something unparseable. */
function epochMs(iso: string): number | null {
  const parsed = Date.parse(iso);
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Focus the first candidate that can actually take it, skipping disabled ones.
 *
 * `.focus()` on a disabled element is silently ignored and leaves focus on
 * <body> — the very state the queued focus moves exist to prevent. Both request
 * buttons spend real time disabled: while their own call is loading, and while
 * the server's 30-second cooldown is counting down on their face. So each
 * queued move names a fallback that is still reachable.
 */
function focusFirstEnabled(
  ...candidates: ReadonlyArray<HTMLButtonElement | HTMLInputElement | null>
): void {
  for (const candidate of candidates) {
    if (candidate === null || candidate.disabled) continue;
    candidate.focus();
    return;
  }
}

export function VerifiableField({
  channel,
  label,
  value,
  onValueChange,
  name,
  signupIdStore,
  verified,
  onVerifiedChange,
  inputRef,
  onNameRequired,
  onVerifiedFocusNext,
  formSubmitting,
}: VerifiableFieldProps) {
  const isPhone = channel === 'PHONE';
  const channelNoun = isPhone ? 'mobile number' : 'email address';

  // useId() rather than hand-picked ids, per COLLABORATION.md §4.3 — two
  // instances of this component sit on the same page, so anything hand-written
  // would collide by construction.
  const inputId = useId();
  const hintId = useId();
  const fieldErrorId = useId();
  const codeId = useId();
  const codeHintId = useId();
  const codeErrorId = useId();
  const noticeId = useId();

  const [step, setStep] = useState<UnverifiedPhase>('idle');
  const [code, setCode] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [cooldown, setCooldown] = useState(0);

  const codeInputRef = useRef<HTMLInputElement>(null);
  const requestButtonRef = useRef<HTMLButtonElement>(null);
  const resendButtonRef = useRef<HTMLButtonElement>(null);
  // Only needed so `expire()` can tell whether this button holds focus at the
  // moment the transition to `expired` removes it from the DOM.
  const verifyCodeButtonRef = useRef<HTMLButtonElement>(null);
  const pendingFocus = useRef<FocusTarget | null>(null);
  const stepBeforeRequest = useRef<UnverifiedPhase>('idle');
  // Bumped on every real edit of the value. Both async handlers capture it
  // before their request and drop the response if it has moved on since — the
  // value stays editable while a request is in flight, and a late reply must
  // never build state (least of all a verified tick) for an address that is no
  // longer in the box.
  const valueGeneration = useRef(0);

  // "Verified" is stored by the PARENT because the submit gate is what reads it,
  // so the terminal state is derived here rather than duplicated. That leaves
  // exactly one source of truth and no local copy that can drift out of step.
  const phase: Phase = verified ? 'verified' : step;
  // `expiresAt !== null` is exactly "a code has been issued for the value
  // currently in the field and nothing has invalidated it since", which is what
  // keeps the panel open across a RESEND: `requesting` is reached both from
  // idle (first send, no panel yet) and from an open panel, and unmounting the
  // panel mid-resend would take the focused resend button out of the DOM with
  // it — dropping focus to <body> in the middle of a deliberate action.
  const codePanelOpen =
    phase === 'awaiting-code' ||
    phase === 'verifying' ||
    phase === 'expired' ||
    (phase === 'requesting' && expiresAt !== null);

  /**
   * What actually goes on the wire. The email is trimmed and lower-cased so the
   * stored `destination` is byte-identical to what the register DTO produces
   * (`z.string().email().toLowerCase()`); the mobile goes as E.164 for the same
   * reason. The API compares the two exactly, so any difference reads to the
   * recruiter as "verify your mobile number" on a number they just verified.
   */
  function currentDestination(): string {
    return isPhone ? toE164IndianMobile(value) : value.trim().toLowerCase();
  }

  // `source: 'resend'` mirrors the API's own vocabulary for a repeat request on
  // an existing challenge row (`resendAvailableAt`, the resend cooldown, the
  // resend cap) — it names the endpoint's behaviour, not a delivery. Nothing is
  // dispatched to the recruiter either way; see the note at the top of the file.
  async function sendCode(source: 'first' | 'resend') {
    if (name.trim().length === 0) {
      // The API requires a name on the challenge row and the sadmin OTP Sessions
      // table leads with it, so firing without one would create a row the staff
      // member relaying the code cannot match to anybody.
      //
      // The failing control is the NAME field, not this one, so nothing is
      // flagged here: marking this input aria-invalid for a valid address, and
      // describing it with a message about a different control, is the exact
      // mis-association WCAG 3.3.1 is about. The parent renders the message at
      // the Name field and moves focus there.
      onNameRequired();
      return;
    }

    const destination = currentDestination();
    const shapeOk = isPhone ? isIndianMobile(value) : EMAIL_SHAPE_RE.test(destination);
    if (!shapeOk) {
      setFieldError(
        isPhone
          ? `Enter your ${INDIAN_MOBILE_DIGITS}-digit mobile number before verifying it.`
          : 'Enter a valid email address before verifying it.',
      );
      inputRef.current?.focus();
      return;
    }

    setFieldError(null);
    setCodeError(null);
    // Captured HERE, before any suspension point, and next to the `destination`
    // it belongs with. `value` lives in this closure, so `destination` can only
    // ever describe the field as it read when this handler started; a generation
    // captured after an await would compare a post-edit value against itself and
    // wave through a request for the address the recruiter has already corrected.
    const generation = valueGeneration.current;
    // A double-fire cannot happen (the buttons disable while loading), but if it
    // ever did, returning to 'requesting' on failure would strand the field.
    stepBeforeRequest.current = step === 'requesting' ? 'idle' : step;
    setStep('requesting');

    // The API mints a NEW signup id for every request that omits one. Two Verify
    // presses inside a single round-trip would therefore create two ids, and the
    // loser's challenge row would be orphaned under an id nobody keeps —
    // leaving the recruiter unable to register at all. So the id-minting request
    // is serialised: whoever gets there first parks its promise, and the other
    // channel waits for it and reuses the id it produced.
    const inFlightMint = signupIdStore.minting.current;
    if (signupIdStore.id.current === null && inFlightMint !== null) {
      await inFlightMint;
      // This gate can hold the handler for a full round-trip, which is plenty of
      // time to spot a typo and fix it. handleValueChange has already torn the
      // field back down to idle, and the only destination this closure can still
      // reach is the old one — so the request must not go out at all.
      if (valueGeneration.current !== generation) return;
    }

    const mintsId = signupIdStore.id.current === null;
    const inFlight = requestOtp({
      signupId: signupIdStore.id.current,
      channel,
      destination,
      name: name.trim(),
    });
    // Parked BEFORE the await so the other channel can find it. The gate only
    // signals "the id question is settled" — this call's own failure is handled
    // below, and requestOtp never rejects, so nothing goes unhandled here.
    if (mintsId) signupIdStore.minting.current = inFlight.then(() => undefined);
    const res = await inFlight;
    // The gate is released whatever happens next, including the discard below —
    // the other channel is waiting on it and only cares whether an id exists.
    if (mintsId) signupIdStore.minting.current = null;
    // Edited mid-flight: handleValueChange has already torn this field back down
    // to idle, so there is nothing to report and nothing to reopen.
    if (valueGeneration.current !== generation) return;

    if (!res.ok) {
      // A failed resend must not throw away a code the recruiter may already be
      // holding, so we return to the state we came from rather than to idle.
      setStep(stepBeforeRequest.current);
      setNotice(null);
      if (source === 'resend') setCodeError(res.error.message);
      else setFieldError(res.error.message);
      // A 429 says exactly when the window reopens; adopt it so the button stops
      // inviting a request the server is going to refuse again.
      if (res.error.resendAvailableAt !== null) {
        setCooldown(secondsUntil(res.error.resendAvailableAt));
      }
      pendingFocus.current = source === 'resend' ? 'resend' : 'request';
      return;
    }

    signupIdStore.id.current = res.data.signupId;
    setExpiresAt(epochMs(res.data.expiresAt));
    setCooldown(secondsUntil(res.data.resendAvailableAt));
    setCode('');
    const shown = isPhone ? formatIndianMobile(value) : destination;
    setNotice(
      source === 'resend'
        ? `New code created for ${shown}. Our team will pass the new one on; the previous code no longer works.`
        : `Code created for ${shown}. A Career Queue team member will pass it on by phone or WhatsApp — nothing is sent to you automatically.`,
    );
    // Every accepted request writes `verifiedAt = null` on the challenge row, so
    // a tick this field may have been granted while this call was in flight (a
    // slow verify landing first) is now false on the server. Leaving it would
    // show a green tick, hide the panel, and produce a 400 at submit with no
    // control left on screen to recover. Already-false is a no-op.
    onVerifiedChange(false);
    setStep('awaiting-code');
    pendingFocus.current = 'code';
  }

  async function submitCode() {
    const signupId = signupIdStore.id.current;
    if (signupId === null) {
      // Unreachable — the panel only opens after a request that minted one.
      setCodeError('Something went wrong. Request a new code and try again.');
      return;
    }
    if (code.length !== CODE_LENGTH) {
      setCodeError(`Enter all ${CODE_LENGTH} digits of the code you were given.`);
      pendingFocus.current = 'code';
      return;
    }

    setCodeError(null);
    setStep('verifying');
    const generation = valueGeneration.current;
    const res = await verifyOtp({ signupId, channel, code });
    // Edited mid-check: the code proved the OLD address, so accepting this reply
    // would put a verified tick on a value nobody has proved anything about.
    if (valueGeneration.current !== generation) return;

    if (!res.ok) {
      // The server owns expiry, but if our own deadline has passed too then the
      // only useful control left is the resend — so land in `expired` and send
      // focus there instead of at an input that is about to be disabled.
      const nowExpired = expiresAt !== null && Date.now() >= expiresAt;
      setStep(nowExpired ? 'expired' : 'awaiting-code');
      setCodeError(res.error.message);
      pendingFocus.current = nowExpired ? 'resend' : 'code';
      return;
    }

    // These two writes belong together: `step` goes back to idle so that when a
    // later edit clears `verified`, the field falls back to a clean idle state
    // rather than reopening a stale code panel.
    setStep('idle');
    setCode('');
    setNotice(null);
    onVerifiedChange(true);
    pendingFocus.current = 'next';
  }

  function handleValueChange(raw: string) {
    const next = isPhone ? normalizeIndianMobile(raw) : raw;
    onValueChange(next);
    // Normalisation can swallow a keystroke whole (a letter typed into the
    // mobile field). Nothing changed, so nothing is invalidated.
    if (next === value) return;

    // THE bug this component exists to prevent: everything already proved is
    // about the value that was just replaced. The tick, the issued code and its
    // deadline all belong to the OLD address, so they die with it. Without this
    // a recruiter could verify one address, edit it, and submit — the API's
    // final check would still refuse, but only after the whole form was filled.
    valueGeneration.current += 1;
    if (verified) onVerifiedChange(false);
    setStep('idle');
    setCode('');
    setExpiresAt(null);
    setNotice(null);
    setCodeError(null);
    setFieldError(null);
    // `cooldown` deliberately survives. The challenge row is keyed on
    // (signupId, channel), so editing the destination reuses the same row and
    // the server's 30-second window keeps running — restarting the countdown
    // here would promise a resend the API is about to refuse.
  }

  function handleCodeChange(raw: string) {
    setCode(raw.replace(/\D/g, '').slice(0, CODE_LENGTH));
    // The error was about the previous attempt; editing makes it stale.
    if (codeError !== null) setCodeError(null);
  }

  function handleCodeKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return;
    // This input sits inside the register <form>, so without this Enter would
    // submit the whole registration instead of checking the code.
    event.preventDefault();
    void submitCode();
  }

  // Cooldown ticker. One self-rescheduling timeout rather than an interval, so
  // it stops on its own at zero with nothing to tear down. Advisory only — the
  // API re-enforces the window — so a little drift costs nothing.
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((seconds) => seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  // Expiry. This runs for a VERIFIED channel too, which is the point: the API
  // requires `expiresAt` to still be in the future when the account is created,
  // not merely that the right code was once entered. A recruiter who verifies
  // and then spends fifteen minutes on the rest of the form has to verify
  // again, and hearing that here beats having the whole registration refused
  // after they press Create account.
  //
  // Re-running the effect is harmless because the deadline is absolute: the
  // remaining time is always recomputed from `expiresAt`, never accumulated.
  useEffect(() => {
    // Only worth watching while a code is outstanding, or while a verification
    // we are relying on is still on the clock. A send in flight is skipped
    // because it is about to replace `expiresAt` anyway.
    const watching = verified || step === 'awaiting-code' || step === 'verifying';
    if (expiresAt === null || !watching) return;

    const expire = () => {
      // Moving to `expired` disables the code input AND removes the "Verify
      // code" button outright. Either one, if it holds focus when it goes,
      // drops focus to <body> — so both are checked, not just the input, and
      // focus is handed to the control that is about to be the only useful one.
      const active = document.activeElement;
      if (active === codeInputRef.current || active === verifyCodeButtonRef.current) {
        pendingFocus.current = 'resend';
      }
      setNotice(null);
      setCodeError(
        verified
          ? `Your ${channelNoun} verification expired. Request a new code to verify it again.`
          : 'That code has expired. Request a new one to continue.',
      );
      if (verified) onVerifiedChange(false);
      setStep('expired');
    };

    const remaining = expiresAt - Date.now();
    if (remaining <= 0) {
      expire();
      return;
    }
    const timer = setTimeout(expire, remaining);
    return () => clearTimeout(timer);
  }, [expiresAt, step, verified, channelNoun, onVerifiedChange]);

  // Focus choreography, deliberately in an effect rather than inline in the
  // handlers: an effect runs AFTER React has committed, which is the only
  // moment at which the code input actually exists (it mounts with
  // `awaiting-code`) or has actually been removed. That second case is the one
  // everybody misses — removing the focused element drops focus to <body>, so a
  // keyboard or screen-reader user who just verified would be silently teleported
  // back to the top of the page. Every exit from `verifying` therefore places
  // focus explicitly, including the exits where the button that was pressed
  // disabled itself while loading. The one exception is a response discarded
  // because the value was edited mid-flight — focus is then already in the input
  // the recruiter is typing into, and moving it would be the rude thing to do.
  //
  // No dependency array on purpose: the ref self-clears, so this acts at most
  // once per queued move no matter how many renders go by.
  useEffect(() => {
    const target = pendingFocus.current;
    if (target === null) return;
    pendingFocus.current = null;
    switch (target) {
      case 'code':
        codeInputRef.current?.focus();
        codeInputRef.current?.select();
        break;
      case 'request':
        focusFirstEnabled(requestButtonRef.current, inputRef.current);
        break;
      case 'resend':
        focusFirstEnabled(resendButtonRef.current, codeInputRef.current, inputRef.current);
        break;
      case 'next':
        onVerifiedFocusNext();
        break;
    }
  });

  // Conditional describedby chains — an aria-describedby that names a node which
  // is not on the page is silently dropped by some AT and read as nothing by the
  // rest, so the ids only appear while their elements do.
  const describedBy = [hintId, fieldError !== null ? fieldErrorId : null]
    .filter((id): id is string => id !== null)
    .join(' ');
  // The notice is described BY the code input rather than announced by a live
  // region of its own: it mounts inside the code panel, in the same commit as
  // the panel, and a role="status" created together with its text is not
  // reliably read out (the rule apps/sadmin's RevealCodeButton states and obeys
  // for the same reason). Focus lands on this input in that same commit, so
  // naming the notice here announces it exactly once, in full, and in order.
  const codeDescribedBy = [
    notice !== null ? noticeId : null,
    codeHintId,
    codeError !== null ? codeErrorId : null,
  ]
    .filter((id): id is string => id !== null)
    .join(' ');

  // Motion is a plain opacity transition on the 150ms/ease-out tokens, entered
  // via @starting-style (Tailwind's `starting:` variant) so no keyframe has to
  // be added to the shared theme.css — which would need a lock nobody holds.
  // prefers-reduced-motion is already handled globally in theme.css's base
  // layer, which collapses every transition to 0.01ms, so it is not repeated.
  const enterMotion =
    'transition-opacity duration-[var(--duration-fast)] ease-[var(--ease-out)] starting:opacity-0';

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={inputId}>{label}</Label>
        {/* The live region is mounted from the FIRST render and stays empty
            until there is something to say. A role="status" element created in
            the same commit as its content is not reliably announced — the rule
            apps/sadmin's RevealCodeButton states and obeys — and this tick is
            the only confirmation the whole flow produces, so losing it means a
            screen-reader user hears nothing but the code panel disappearing. */}
        <span role="status">
          {verified && (
            // The word "Verified" beside the tick because an icon alone is
            // invisible to AT. The colour is --color-success darkened toward the
            // foreground for the same reason FormError darkens --color-danger:
            // the raw token is far under 4.5:1 as body text on a light surface.
            <span
              className={cn(
                'inline-flex items-center gap-1 text-xs font-medium',
                'text-[color-mix(in_oklch,var(--color-success),var(--color-fg)_30%)]',
                enterMotion,
              )}
            >
              <Check className="size-3.5" aria-hidden="true" />
              Verified
            </span>
          )}
        </span>
      </div>

      <div className="relative">
        {isPhone && (
          // Visual affix only: aria-hidden, because a screen reader announcing
          // "plus nine one" in the middle of the field's name helps nobody. The
          // country code is stated in the hint below, which the input names in
          // its aria-describedby.
          <span
            aria-hidden="true"
            className={cn(
              'pointer-events-none absolute inset-y-0 left-0 flex w-12 items-center justify-center',
              'border-r border-[var(--color-border-strong)] text-sm text-[var(--color-fg-muted)]',
              // Matches the Input atom's own disabled:opacity-50 so the affix
              // does not stay crisp beside a greyed-out field.
              formSubmitting && 'opacity-50',
            )}
          >
            {INDIA_CALLING_CODE}
          </span>
        )}
        <Input
          ref={inputRef}
          id={inputId}
          type={isPhone ? 'tel' : 'email'}
          inputMode={isPhone ? 'numeric' : 'email'}
          autoComplete={isPhone ? 'tel-national' : 'email'}
          required
          // The mobile cap counts RAW characters, so it has to leave room for
          // the separators and the country code a recruiter actually pastes —
          // see INDIAN_MOBILE_INPUT_MAX_LENGTH. Capping at INDIAN_MOBILE_DIGITS
          // made the browser clip "+91 98765 43210" to "+91 98765 " before
          // onChange ever ran. 254 is the RFC 5321 limit on an email address.
          maxLength={isPhone ? INDIAN_MOBILE_INPUT_MAX_LENGTH : 254}
          aria-describedby={describedBy}
          invalid={fieldError !== null}
          disabled={formSubmitting}
          value={value}
          onChange={(event) => handleValueChange(event.target.value)}
          className={cn(isPhone && 'pl-[3.75rem]')}
        />
      </div>

      <p id={hintId} className="text-xs text-[var(--color-fg-muted)]">
        {isPhone
          ? `Indian mobile numbers only — country code ${INDIA_CALLING_CODE}. Our team calls or messages this number to pass on your codes, so use one you can answer.`
          : `Verifying creates a ${CODE_LENGTH}-digit code for this address. Nothing is emailed to you — a Career Queue team member passes the code on by phone or WhatsApp.`}
      </p>

      {!verified && !codePanelOpen && (
        <Button
          ref={requestButtonRef}
          type="button"
          variant="secondary"
          size="sm"
          loading={phase === 'requesting'}
          // Gated on the cooldown for the same reason the button below is. The
          // cooldown deliberately outlives an edit of the value
          // (handleValueChange says why), so this button can be the only control
          // on screen while the server's window is still running — and pressing
          // it then earns a 429 and spends one of the five requests a minute the
          // API allows. The countdown on its face is what keeps a disabled
          // control from being an unexplained dead end.
          disabled={formSubmitting || cooldown > 0}
          onClick={() => void sendCode('first')}
        >
          {cooldown > 0
            ? `Try again in ${cooldown}s`
            : isPhone
              ? 'Verify mobile number'
              : 'Verify email'}
        </Button>
      )}

      {codePanelOpen && (
        <div
          className={cn(
            'space-y-2 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-muted)] p-3',
            enterMotion,
          )}
        >
          <Label htmlFor={codeId}>Enter the {CODE_LENGTH}-digit code</Label>
          <div className="flex items-center gap-2">
            <Input
              ref={codeInputRef}
              id={codeId}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={CODE_LENGTH}
              aria-describedby={codeDescribedBy}
              invalid={codeError !== null}
              disabled={phase === 'expired' || formSubmitting}
              value={code}
              onChange={(event) => handleCodeChange(event.target.value)}
              onKeyDown={handleCodeKeyDown}
              className="w-32 tabular-nums tracking-[0.25em]"
            />
            {phase !== 'expired' && (
              <Button
                ref={verifyCodeButtonRef}
                type="button"
                variant="secondary"
                size="sm"
                loading={phase === 'verifying'}
                disabled={formSubmitting}
                onClick={() => void submitCode()}
              >
                Verify code
              </Button>
            )}
          </div>

          {notice !== null && (
            // No role="status" here: this paragraph mounts with the panel around
            // it, and the code input names it in aria-describedby instead. See
            // `codeDescribedBy` above for why that is the reliable one. It sits
            // above the hint so the reading order matches the DOM order.
            <p id={noticeId} className="text-xs text-[var(--color-fg-muted)]">
              {notice}
            </p>
          )}

          <p id={codeHintId} className="text-xs text-[var(--color-fg-muted)]">
            A code expires {CODE_TTL_MINUTES} minutes after it is created —
            request a new one if you have not been given it by then.
          </p>

          {/* Both this button and the first-request button above are disabled
              during the cooldown, which is fine because each one's own label
              says why and counts down. The form's Create account button is the
              opposite case — its blocker lives in two other fields, so nothing
              on the button could explain it, and it stays enabled with standing
              copy instead. */}
          <Button
            ref={resendButtonRef}
            type="button"
            variant="ghost"
            size="sm"
            className="-ml-3"
            loading={phase === 'requesting'}
            disabled={formSubmitting || cooldown > 0}
            onClick={() => void sendCode('resend')}
          >
            {/* The countdown label takes priority over every other wording, so
                the one state in which this button is disabled always explains
                itself on the button's own face. "Request", never "resend":
                pressing this creates a fresh code for a staff member to relay,
                it does not dispatch anything to the recruiter. */}
            {cooldown > 0
              ? `New code in ${cooldown}s`
              : phase === 'expired'
                ? 'Request a new code'
                : 'Request another code'}
          </Button>

          {codeError !== null && <FormError id={codeErrorId}>{codeError}</FormError>}
        </div>
      )}

      {fieldError !== null && <FormError id={fieldErrorId}>{fieldError}</FormError>}
    </div>
  );
}
