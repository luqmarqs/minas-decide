import * as RadixTabs from '@radix-ui/react-tabs';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

export const Tabs = RadixTabs.Root;
export const TabsContent = RadixTabs.Content;

export function TabsList({ className, ...rest }: ComponentProps<typeof RadixTabs.List>) {
  return (
    <RadixTabs.List
      className={cn(
        'inline-flex max-w-full gap-1 overflow-x-auto rounded-md bg-surface-alt p-1',
        className,
      )}
      {...rest}
    />
  );
}

export function TabsTrigger({ className, ...rest }: ComponentProps<typeof RadixTabs.Trigger>) {
  return (
    <RadixTabs.Trigger
      className={cn(
        'min-h-11 shrink-0 rounded-sm px-3 text-sm font-medium whitespace-nowrap text-secondary',
        'transition-colors duration-(--duration-fast) ease-(--easing-standard) hover:text-primary',
        'data-[state=active]:bg-surface-raised data-[state=active]:text-primary data-[state=active]:shadow-raised',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...rest}
    />
  );
}
