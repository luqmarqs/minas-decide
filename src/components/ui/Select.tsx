import * as RadixSelect from '@radix-ui/react-select';
import { cn } from '@/lib/cn';
import { Icon } from './Icon';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps {
  value: string | undefined;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  id?: string;
  /** Required when no visible <label htmlFor> points to `id`. */
  'aria-label'?: string;
  'aria-describedby'?: string;
  disabled?: boolean;
  className?: string;
  size?: 'sm' | 'md';
}

export function Select({
  value,
  onValueChange,
  options,
  placeholder = 'Selecione',
  id,
  disabled,
  className,
  size = 'md',
  ...aria
}: SelectProps) {
  return (
    <RadixSelect.Root value={value} onValueChange={onValueChange} disabled={disabled}>
      <RadixSelect.Trigger
        id={id}
        aria-label={aria['aria-label']}
        aria-describedby={aria['aria-describedby']}
        className={cn(
          'inline-flex min-h-11 w-full items-center justify-between gap-2 rounded-md border border-border-strong bg-surface-raised px-3 text-left text-primary',
          'transition-colors duration-(--duration-fast) ease-(--easing-standard) hover:border-action',
          'disabled:cursor-not-allowed disabled:opacity-55 data-[placeholder]:text-muted',
          size === 'sm' ? 'text-sm' : 'text-base',
          className,
        )}
      >
        <RadixSelect.Value placeholder={placeholder} />
        <RadixSelect.Icon>
          <Icon name="chevronDown" size={16} />
        </RadixSelect.Icon>
      </RadixSelect.Trigger>
      <RadixSelect.Portal>
        <RadixSelect.Content
          position="popper"
          sideOffset={4}
          className="z-(--z-dialog) max-h-(--radix-select-content-available-height) min-w-(--radix-select-trigger-width) overflow-hidden rounded-md border border-border bg-surface-raised text-primary shadow-raised"
        >
          <RadixSelect.Viewport className="p-1">
            {options.map((o) => (
              <RadixSelect.Item
                key={o.value}
                value={o.value}
                disabled={o.disabled}
                className={cn(
                  'relative flex min-h-11 cursor-pointer items-center rounded-sm py-2 pr-3 pl-8 text-sm outline-none select-none',
                  'data-[highlighted]:bg-action-soft data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50',
                )}
              >
                <RadixSelect.ItemIndicator className="absolute left-2 inline-flex">
                  <Icon name="check" size={16} />
                </RadixSelect.ItemIndicator>
                <RadixSelect.ItemText>{o.label}</RadixSelect.ItemText>
              </RadixSelect.Item>
            ))}
          </RadixSelect.Viewport>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  );
}
