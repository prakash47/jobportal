'use client';

import { forwardRef, useState, type InputHTMLAttributes } from 'react';
import { Input, cn } from '@jobportal/ui';
import { Eye, EyeOff } from '@jobportal/ui/icons';

export interface PasswordInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  invalid?: boolean;
  /**
   * Optional CONTROLLED visibility. Omit both and the field keeps its own
   * state, so existing callers (LoginForm, RegisterForm) are unaffected.
   *
   * The reset form lifts it because a "new password" + "confirm" pair needs ONE
   * shared toggle: you cannot compare two strings by eye when one of them is
   * still dots, so two independent eyes defeat the point of the confirm field.
   */
  visible?: boolean;
  onVisibleChange?: (visible: boolean) => void;
}

// Password field with a show/hide toggle. Wraps the shared Input and overlays
// an eye button that flips the type between password/text. The toggle is a real
// keyboard-focusable button and is type="button" so it never submits the form.
export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  function PasswordInput({ className, visible: visibleProp, onVisibleChange, ...props }, ref) {
    const [internal, setInternal] = useState(false);
    const isControlled = visibleProp !== undefined;
    const visible = isControlled ? visibleProp : internal;
    const setVisible = (next: boolean) => {
      if (!isControlled) setInternal(next);
      onVisibleChange?.(next);
    };
    return (
      <div className="relative">
        <Input ref={ref} type={visible ? 'text' : 'password'} className={cn('pr-10', className)} {...props} />
        <button
          type="button"
          onClick={() => setVisible(!visible)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-md text-[var(--color-fg-muted)] transition-colors hover:text-[var(--color-fg)]"
        >
          {visible ? (
            <EyeOff className="size-4" aria-hidden="true" />
          ) : (
            <Eye className="size-4" aria-hidden="true" />
          )}
        </button>
      </div>
    );
  },
);
