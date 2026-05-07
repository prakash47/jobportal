import { type HTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

export interface ContainerProps extends HTMLAttributes<HTMLDivElement> {
  size?: 'sm' | 'md' | 'lg' | 'full';
}

const SIZE_CLASSES: Record<NonNullable<ContainerProps['size']>, string> = {
  sm: 'max-w-3xl',
  md: 'max-w-5xl',
  lg: 'max-w-[var(--container-max)]',
  full: 'max-w-none',
};

export function Container({ size = 'lg', className, ...props }: ContainerProps) {
  return <div className={cn('mx-auto w-full px-4 sm:px-6 lg:px-8', SIZE_CLASSES[size], className)} {...props} />;
}
