import type { InputHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export const inputClasses =
  'block w-full min-h-11 rounded-md border border-border-strong bg-surface-raised px-3 py-2 text-base text-primary ' +
  'placeholder:text-muted transition-[border-color,box-shadow] duration-(--duration-fast) ease-(--easing-standard) ' +
  'hover:border-secondary focus-visible:border-action focus-visible:outline-3 focus-visible:outline-focus ' +
  'disabled:cursor-not-allowed disabled:bg-surface-alt disabled:opacity-70 ' +
  'aria-invalid:border-error aria-invalid:bg-error-soft/30';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export function Input({ invalid, className, ...rest }: InputProps) {
  return (
    <input aria-invalid={invalid || undefined} className={cn(inputClasses, className)} {...rest} />
  );
}

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export function Textarea({ invalid, className, ...rest }: TextareaProps) {
  return (
    <textarea
      aria-invalid={invalid || undefined}
      className={cn(inputClasses, 'min-h-28 resize-y', className)}
      {...rest}
    />
  );
}
