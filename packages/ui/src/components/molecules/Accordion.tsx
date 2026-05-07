'use client';

import * as RadixAccordion from '@radix-ui/react-accordion';
import { ChevronDown } from 'lucide-react';
import { forwardRef, type ComponentPropsWithoutRef } from 'react';
import { cn } from '../../lib/cn';

export const Accordion = RadixAccordion.Root;

export const AccordionItem = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof RadixAccordion.Item>
>(function AccordionItem({ className, ...props }, ref) {
  return (
    <RadixAccordion.Item ref={ref} className={cn('border-b border-[var(--color-border)]', className)} {...props} />
  );
});

export const AccordionTrigger = forwardRef<
  HTMLButtonElement,
  ComponentPropsWithoutRef<typeof RadixAccordion.Trigger>
>(function AccordionTrigger({ className, children, ...props }, ref) {
  return (
    <RadixAccordion.Header className="flex">
      <RadixAccordion.Trigger
        ref={ref}
        className={cn(
          'flex flex-1 items-center justify-between py-3 text-sm font-medium text-[var(--color-fg)]',
          'transition-all',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]',
          '[&[data-state=open]>svg]:rotate-180',
          className,
        )}
        {...props}
      >
        {children}
        <ChevronDown className="size-4 shrink-0 text-[var(--color-fg-muted)] transition-transform duration-200" />
      </RadixAccordion.Trigger>
    </RadixAccordion.Header>
  );
});

export const AccordionContent = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof RadixAccordion.Content>
>(function AccordionContent({ className, children, ...props }, ref) {
  return (
    <RadixAccordion.Content
      ref={ref}
      className="overflow-hidden text-sm text-[var(--color-fg-muted)] data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:slide-out-to-top-1 data-[state=open]:slide-in-from-top-1"
      {...props}
    >
      <div className={cn('pb-3 pt-0', className)}>{children}</div>
    </RadixAccordion.Content>
  );
});
