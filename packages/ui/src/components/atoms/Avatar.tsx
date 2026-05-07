'use client';

import * as RadixAvatar from '@radix-ui/react-avatar';
import { forwardRef, type ComponentPropsWithoutRef } from 'react';
import { cn } from '../../lib/cn';

export type AvatarSize = 'sm' | 'md' | 'lg';

export interface AvatarProps extends ComponentPropsWithoutRef<typeof RadixAvatar.Root> {
  size?: AvatarSize;
  src?: string;
  alt?: string;
  fallback?: string;
}

const SIZE_CLASSES: Record<AvatarSize, string> = {
  sm: 'size-7 text-xs',
  md: 'size-9 text-sm',
  lg: 'size-12 text-base',
};

export const Avatar = forwardRef<HTMLSpanElement, AvatarProps>(function Avatar(
  { size = 'md', src, alt, fallback, className, ...props },
  ref,
) {
  return (
    <RadixAvatar.Root
      ref={ref}
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full bg-[var(--color-bg-muted)] font-medium text-[var(--color-fg-muted)]',
        SIZE_CLASSES[size],
        className,
      )}
      {...props}
    >
      {src && <RadixAvatar.Image className="aspect-square size-full object-cover" src={src} alt={alt ?? ''} />}
      <RadixAvatar.Fallback className="flex size-full items-center justify-center">
        {fallback ?? '?'}
      </RadixAvatar.Fallback>
    </RadixAvatar.Root>
  );
});
