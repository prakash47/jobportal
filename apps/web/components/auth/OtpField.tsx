'use client';

import { useId, useRef, type ChangeEvent, type ClipboardEvent } from 'react';
import { cn } from '@jobportal/ui';
import { extractOtp } from '../../lib/auth/password-rules';

// ONE REAL INPUT, SIX PAINTED WELLS — deliberately not six inputs:
//  1. autocomplete="one-time-code" and keychain autofill target exactly ONE
//     field; six inputs is where autofill reliably breaks, filling box 1 and
//     leaving five empty.
//  2. Paste is free — one onChange does the work, and it survives someone
//     pasting the whole sentence out of the email body.
//  3. Assistive tech gets one control with one name, one aria-invalid and one
//     description, instead of "1 of 6, blank… 2 of 6, blank…".
//  4. Backspace, arrows, Home/End, Ctrl+A and undo stay native text editing
//     rather than a hand-rolled onKeyDown.
//  5. One tab stop.
//
// The real input sits at opacity-0 over the whole row (never display:none or
// visibility:hidden — both kill autofill), so a tap anywhere focuses it.

const CELLS = 6;

export type OtpState = 'idle' | 'verifying' | 'error' | 'dead';

export function OtpField({
  value,
  onChange,
  onComplete,
  state = 'idle',
  describedBy,
}: {
  value: string;
  onChange: (next: string) => void;
  onComplete?: (code: string) => void;
  state?: OtpState;
  describedBy?: string;
}) {
  const uid = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  // Guards auto-submit: without it a wrong code re-fires on every correcting
  // keystroke, and a manager fill arriving as one 6-char change double-fires
  // against the explicit button.
  const lastSubmitted = useRef<string | null>(null);

  const dead = state === 'dead';

  const commit = (next: string) => {
    onChange(next);
    if (next.length < CELLS) {
      lastSubmitted.current = null;
      return;
    }
    if (lastSubmitted.current === next) return;
    lastSubmitted.current = next;
    onComplete?.(next);
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    // Android IME: mid-composition values are provisional.
    if ((e.nativeEvent as unknown as { isComposing?: boolean }).isComposing) return;
    commit(e.target.value.replace(/\D/g, '').slice(0, CELLS));
  };

  const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text');
    if (!text) return;
    e.preventDefault();
    commit(extractOtp(text));
  };

  // The well model assumes the caret is at the end. Without this clamp a click
  // mid-row lets a digit insert at position 2 and the painted value diverges
  // from the real one.
  const clampCaret = () => {
    const el = inputRef.current;
    if (!el) return;
    const end = el.value.length;
    el.setSelectionRange(end, end);
  };

  return (
    <div
      className={cn(
        'relative rounded-[var(--radius-md)]',
        // One field, one ring. --color-ring (primary-500) measures 7.86:1;
        // --color-focus-ring is a 22% alpha mix that composites to ~1.2:1 and
        // is not a focus indicator.
        'has-[input:focus-visible]:outline has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-[var(--color-ring)] has-[input:focus-visible]:outline-offset-2',
      )}
    >
      <label htmlFor={uid} className="sr-only">
        6-digit verification code
      </label>
      <input
        ref={inputRef}
        id={uid}
        value={value}
        onChange={handleChange}
        onPaste={handlePaste}
        onFocus={clampCaret}
        onClick={clampCaret}
        readOnly={dead}
        aria-disabled={dead || undefined}
        aria-invalid={state === 'error' || undefined}
        {...(describedBy ? { 'aria-describedby': describedBy } : {})}
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="one-time-code"
        enterKeyHint="go"
        maxLength={CELLS}
        data-1p-ignore
        data-lpignore="true"
        className="absolute inset-0 z-10 h-full w-full cursor-text opacity-0"
      />
      <div aria-hidden="true" className="pointer-events-none flex gap-2">
        {Array.from({ length: CELLS }, (_, i) => {
          const char = value[i];
          const isCurrent = !dead && state !== 'verifying' && i === value.length;
          return (
            <div
              key={i}
              className={cn(
                'relative flex h-14 flex-1 items-center justify-center rounded-[var(--radius-md)] border text-2xl font-semibold tabular-nums sm:h-16 sm:text-3xl',
                // The 3+3 split: how people actually transcribe a code.
                i === 2 && 'mr-2',
                dead
                  ? 'border-[var(--color-border)] bg-[var(--color-bg-muted)] text-[var(--color-fg-muted)]'
                  : state === 'error'
                    ? // Digits stay fg — recolouring them red inside red borders
                      // is shouting, and is the classic contrast trap.
                      'border-[var(--color-danger)] bg-[var(--color-bg-elevated)] text-[var(--color-fg)]'
                    : 'border-[var(--color-neutral-500)] bg-[var(--color-bg-elevated)] text-[var(--color-fg)]',
              )}
            >
              {char ?? ''}
              {/* The 2px floor rule carries the state; the border stays quiet. */}
              <span
                className={cn(
                  'absolute inset-x-0 bottom-0 h-0.5 rounded-b-[var(--radius-md)] transition-colors duration-[var(--duration-fast)] ease-[var(--ease-out)]',
                  dead
                    ? 'bg-[var(--color-border)]'
                    : state === 'error'
                      ? 'bg-[var(--color-danger)]'
                      : state === 'verifying'
                        ? 'bg-[var(--color-accent-600)]'
                        : char
                          ? 'bg-[var(--color-primary-600)]'
                          : isCurrent
                            ? 'bg-[var(--color-accent-600)]'
                            : 'bg-[var(--color-border-strong)]',
                )}
              />
              {/* Static caret — a blink would add motion noise to a page whose
                  job is calm. The cyan floor already says "you are here". */}
              {isCurrent && !char && (
                <span className="absolute h-6 w-0.5 bg-[var(--color-accent-600)]" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
