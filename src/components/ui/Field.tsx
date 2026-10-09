import { useId, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface FieldControlProps {
  id: string;
  'aria-describedby': string | undefined;
  'aria-invalid': true | undefined;
  'aria-required': true | undefined;
}

export interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  /** Explicit id for the control (defaults to a generated one). */
  id?: string;
  className?: string;
  children: (control: FieldControlProps) => ReactNode;
}

/**
 * Label + hint + error wired with aria-describedby / aria-invalid. The error is
 * also rendered as text (never color-only).
 */
export function Field({ label, hint, error, required, id, className, children }: FieldProps) {
  const auto = useId();
  const controlId = id ?? `f-${auto}`;
  const hintId = hint ? `${controlId}-hint` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={controlId} className="text-sm font-semibold text-primary">
        {label}
        {required ? (
          <span className="ml-1 font-normal text-muted">
            <span aria-hidden="true">*</span>
            <span className="sr-only">(obrigatório)</span>
          </span>
        ) : null}
      </label>
      {hint ? (
        <p id={hintId} className="text-sm text-muted">
          {hint}
        </p>
      ) : null}
      {children({
        id: controlId,
        'aria-describedby': describedBy,
        'aria-invalid': error ? true : undefined,
        'aria-required': required ? true : undefined,
      })}
      {error ? (
        <p id={errorId} className="flex items-start gap-1 text-sm font-medium text-error">
          <span aria-hidden="true">!</span>
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}

/** Error summary for forms (spec §12.14): list of field errors linked to fields. */
export function FormErrorSummary({
  errors,
  title = 'Revise os campos abaixo',
}: {
  errors: { fieldId: string; message: string }[];
  title?: string;
}) {
  if (errors.length === 0) return null;
  return (
    <div role="alert" className="rounded-md border border-error bg-error-soft p-4 text-primary">
      <p className="font-semibold">{title}</p>
      <ul className="mt-2 list-disc pl-5 text-sm">
        {errors.map((e) => (
          <li key={e.fieldId}>
            <a href={`#${e.fieldId}`} className="inline-block min-h-6 py-1 underline">
              {e.message}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
