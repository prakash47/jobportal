'use client';

import * as RadixRadioGroup from '@radix-ui/react-radio-group';
import { forwardRef, type ComponentPropsWithoutRef } from 'react';
import { cn } from '../../lib/cn';

export const RadioGroup = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof RadixRadioGroup.Root>
>(function RadioGroup({ className, ...props }, ref) {
  return <RadixRadioGroup.Root ref={ref} className={cn('grid gap-2', className)} {...props} />;
});

export const RadioItem = forwardRef<
  HTMLButtonElement,
  ComponentPropsWithoutRef<typeof RadixRadioGroup.Item>
>(function RadioItem({ className, ...props }, ref) {
  return (
    <RadixRadioGroup.Item
      ref={ref}
      className={cn(
        'aspect-square size-4 rounded-full border border-[var(--color-border-strong)] bg-[var(--color-bg-elevated)]',
        'transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-bg)]',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'data-[state=checked]:border-[var(--color-primary-600)]',
        className,
      )}
      {...props}
    >
      <RadixRadioGroup.Indicator className="flex h-full w-full items-center justify-center">
        <span className="size-1.5 rounded-full bg-[var(--color-primary-600)]" />
      </RadixRadioGroup.Indicator>
    </RadixRadioGroup.Item>
  );
});
