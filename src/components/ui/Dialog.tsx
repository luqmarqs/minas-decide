import * as RadixDialog from '@radix-ui/react-dialog';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Icon } from './Icon';

export const Dialog = RadixDialog.Root;
export const DialogTrigger = RadixDialog.Trigger;
export const DialogClose = RadixDialog.Close;

export interface DialogContentProps {
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  className?: string;
  /** Hide the visual title (still announced). */
  hideTitle?: boolean;
}

export function DialogContent({
  title,
  description,
  children,
  className,
  hideTitle,
}: DialogContentProps) {
  return (
    <RadixDialog.Portal>
      <RadixDialog.Overlay className="fixed inset-0 z-(--z-dialog) bg-(--color-surface-overlay) data-[state=open]:animate-[fade-in_var(--duration-panel)_var(--easing-standard)]" />
      <RadixDialog.Content
        className={cn(
          'fixed top-1/2 left-1/2 z-(--z-dialog) max-h-[85dvh] w-[min(92vw,32rem)] -translate-x-1/2 -translate-y-1/2 overflow-auto',
          'rounded-card border border-border bg-surface-raised p-6 text-primary shadow-raised',
          'data-[state=open]:animate-[dialog-in_var(--duration-panel)_var(--easing-emphasized)]',
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <RadixDialog.Title className={cn('text-xl', hideTitle && 'sr-only')}>
            {title}
          </RadixDialog.Title>
          <RadixDialog.Close
            className="-mt-2 -mr-2 grid size-11 shrink-0 place-items-center rounded-md text-secondary hover:bg-surface-alt"
            aria-label="Fechar"
          >
            <Icon name="close" />
          </RadixDialog.Close>
        </div>
        {description ? (
          <RadixDialog.Description className="mt-1 text-sm text-muted">
            {description}
          </RadixDialog.Description>
        ) : (
          <RadixDialog.Description className="sr-only">{title}</RadixDialog.Description>
        )}
        <div className="mt-4">{children}</div>
      </RadixDialog.Content>
    </RadixDialog.Portal>
  );
}
