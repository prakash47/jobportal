'use client';

import * as RadixLabel from '@radix-ui/react-label';
import { forwardRef, type ComponentPropsWithoutRef } from 'react';
import { cn } from '../../lib/cn';

export type LabelProps = ComponentPropsWithoutRef<typeof RadixLabel.Root>;

export const Label = forwardRef<HTMLLabelElement, LabelProps>(function Label(
  { className, ...props },
  ref,
) {
  return (
    <RadixLabel.Root
      ref={ref}
      className={cn('block text-sm font-medium text-[var(--color-fg)]', className)}
      {...props}
    />
  );
});
