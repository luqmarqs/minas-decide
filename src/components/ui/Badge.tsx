import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export type BadgeVariant = 'neutral' | 'demo' | 'success' | 'warning' | 'error' | 'info' | 'accent';

const variants: Record<BadgeVariant, string> = {
  neutral: 'bg-surface-alt text-secondary border-border',
  // DEMO is high-salience on purpose: synthetic data must never pass as real.
  demo: 'bg-demo-soft text-demo border-demo font-bold tracking-wide uppercase',
  success: 'bg-success-soft text-success border-success/40',
  warning: 'bg-warning-soft text-warning border-warning/40',
  error: 'bg-error-soft text-error border-error/40',
  info: 'bg-info-soft text-info border-info/40',
  accent: 'bg-accent-soft text-primary border-accent/50',
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

export function Badge({ variant = 'neutral', className, ...rest }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-pill border px-2 py-0.5 text-xs leading-5 font-semibold whitespace-nowrap',
        variants[variant],
        className,
      )}
      {...rest}
    />
  );
}
