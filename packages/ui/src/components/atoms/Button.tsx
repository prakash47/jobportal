'use client';

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Slot } from '@radix-ui/react-slot';
import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  asChild?: boolean;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    'bg-[var(--color-primary-600)] text-white hover:bg-[var(--color-primary-700)] disabled:bg-[var(--color-primary-300)]',
  secondary:
    'bg-[var(--color-bg-elevated)] text-[var(--color-fg)] border border-[var(--color-border-strong)] hover:bg-[var(--color-bg-muted)] disabled:opacity-50',
  ghost:
    'bg-transparent text-[var(--color-fg)] hover:bg-[var(--color-bg-muted)] disabled:opacity-50',
  danger:
    'bg-[var(--color-danger)] text-white hover:opacity-90 disabled:opacity-50',
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-sm gap-1.5',
  md: 'h-9 px-4 text-sm gap-2',
  lg: 'h-11 px-5 text-base gap-2',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'primary',
    size = 'md',
    loading = false,
    disabled,
    leadingIcon,
    trailingIcon,
    asChild = false,
    className,
    children,
    ...props
  },
  ref,
) {
  const isDisabled = disabled || loading;
  const buttonClass = cn(
    'inline-flex items-center justify-center rounded-md font-medium transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]',
    'disabled:cursor-not-allowed',
    VARIANT_CLASSES[variant],
    SIZE_CLASSES[size],
    className,
  );

  // asChild path: hand the merged props to whatever element the caller
  // provided (typically <Link>) and let it own its own children. Radix
  // Slot's Children.only assertion only tolerates a single child, so the
  // span-wrap / leading-icon / trailing-icon sandwich the regular path
  // uses isn't legal here. Loading/leadingIcon/trailingIcon are ignored
  // in this mode — callers that need them shouldn't use asChild.
  //
  // Disabled handling: native `disabled` is meaningless on `<a>` (Slot's
  // most common target), so we forward as aria-disabled + data-disabled.
  // Callers should still gate the inner Link's href / tabIndex when click
  // suppression matters; aria-disabled alone doesn't stop pointer events.
  //
  // ARIA attrs are added to the props object CONDITIONALLY rather than
  // passed as `aria-busy={loading || undefined}`. The latter shape made
  // Radix Slot 1.1.0 + React 19 emit different SSR vs CSR output (the
  // attr appeared as a string on the server but was stripped on the
  // client), producing a hydration mismatch on every Button asChild on
  // the homepage. PR #34 review caught this.
  if (asChild) {
    const slotProps: Record<string, unknown> = {
      ref: ref as React.Ref<HTMLElement>,
      className: buttonClass,
      ...props,
    };
    if (loading) slotProps['aria-busy'] = true;
    if (isDisabled) {
      slotProps['aria-disabled'] = true;
      slotProps['data-disabled'] = true;
    }
    return <Slot {...slotProps}>{children}</Slot>;
  }

  return (
    <button
      ref={ref}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={buttonClass}
      {...props}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : leadingIcon}
      <span>{children}</span>
      {!loading && trailingIcon}
    </button>
  );
});
