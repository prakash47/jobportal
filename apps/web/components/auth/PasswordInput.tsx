'use client';

import { forwardRef, useState, type InputHTMLAttributes } from 'react';
import { Input, cn } from '@jobportal/ui';
import { Eye, EyeOff } from '@jobportal/ui/icons';

export interface PasswordInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  invalid?: boolean;
}

// Password field with a show/hide toggle. Wraps the shared Input and overlays
// an eye button that flips the type between password/text. The toggle is a real
// keyboard-focusable button and is type="button" so it never submits the form.
export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  function PasswordInput({ className, ...props }, ref) {
    const [visible, setVisible] = useState(false);
    return (
      <div className="relative">
        <Input ref={ref} type={visible ? 'text' : 'password'} className={cn('pr-10', className)} {...props} />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
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
