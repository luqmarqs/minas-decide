import * as RadixCheckbox from '@radix-ui/react-checkbox';
import { useId, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Icon } from './Icon';

export interface CheckboxProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  required?: boolean;
  invalid?: boolean;
  id?: string;
  name?: string;
  'aria-describedby'?: string;
  className?: string;
}

export function Checkbox({
  checked,
  onCheckedChange,
  label,
  description,
  disabled,
  required,
  invalid,
  id,
  name,
  className,
  ...rest
}: CheckboxProps) {
  const auto = useId();
  const cid = id ?? `cb-${auto}`;
  const descId = description ? `${cid}-desc` : undefined;
  const describedBy = [descId, rest['aria-describedby']].filter(Boolean).join(' ') || undefined;
  return (
    <div className={cn('flex items-start gap-3', className)}>
      <RadixCheckbox.Root
        id={cid}
        name={name}
        checked={checked}
        onCheckedChange={(v) => onCheckedChange(v === true)}
        disabled={disabled}
        required={required}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        className={cn(
          // 24px box inside a 44px hit area (negative margin keeps layout tight)
          'relative mt-0.5 grid size-6 shrink-0 place-items-center rounded-sm border-2 border-border-strong bg-surface-raised',
          'transition-colors duration-(--duration-fast) ease-(--easing-standard)',
          'before:absolute before:-inset-2.5 before:content-[""]',
          'hover:border-action data-[state=checked]:border-action data-[state=checked]:bg-action data-[state=checked]:text-on-action',
          'disabled:cursor-not-allowed disabled:opacity-55 aria-invalid:border-error',
        )}
      >
        <RadixCheckbox.Indicator>
          <Icon name="check" size={16} strokeWidth={3} />
        </RadixCheckbox.Indicator>
      </RadixCheckbox.Root>
      <div className="flex flex-col gap-0.5">
        <label htmlFor={cid} className="cursor-pointer text-base text-primary">
          {label}
        </label>
        {description ? (
          <p id={descId} className="text-sm text-muted">
            {description}
          </p>
        ) : null}
      </div>
    </div>
  );
}
