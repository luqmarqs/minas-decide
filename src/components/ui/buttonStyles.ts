import { cn } from '@/lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle';
export type ButtonSize = 'sm' | 'md' | 'lg';

const base =
  'inline-flex items-center justify-center gap-2 rounded-md font-medium select-none ' +
  'transition-[background-color,border-color,color,box-shadow,transform] duration-(--duration-fast) ease-(--easing-standard) ' +
  'active:translate-y-px disabled:cursor-not-allowed disabled:opacity-55 disabled:active:translate-y-0 ' +
  'aria-disabled:cursor-not-allowed aria-disabled:opacity-55';

const variants: Record<ButtonVariant, string> = {
  primary:
    'bg-action text-on-action hover:bg-action-hover active:bg-action-active disabled:hover:bg-action',
  secondary:
    'border border-border-strong bg-surface-raised text-primary hover:border-action hover:bg-action-soft disabled:hover:bg-surface-raised',
  ghost: 'text-primary hover:bg-surface-alt disabled:hover:bg-transparent',
  subtle: 'bg-surface-alt text-primary hover:bg-action-soft disabled:hover:bg-surface-alt',
  danger: 'bg-error text-on-action hover:opacity-90',
};

const sizes: Record<ButtonSize, string> = {
  // All sizes keep a ≥44px touch target (sm is visually compact via padding only).
  sm: 'min-h-11 px-3 text-sm',
  md: 'min-h-11 px-4 text-base',
  lg: 'min-h-12 px-5 text-lg',
};

export function buttonClasses(
  variant: ButtonVariant = 'primary',
  size: ButtonSize = 'md',
  className?: string,
): string {
  return cn(base, variants[variant], sizes[size], className);
}
