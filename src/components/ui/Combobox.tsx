import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { Icon } from './Icon';
import { Spinner } from './Spinner';

export interface ComboboxProps<T> {
  label: string;
  /** Hide the label visually (still read by screen readers). */
  hideLabel?: boolean;
  placeholder?: string;
  inputValue: string;
  onInputChange: (value: string) => void;
  items: T[];
  getKey: (item: T) => string;
  /** Text announced/used for the option. */
  getLabel: (item: T) => string;
  renderItem?: (item: T, state: { active: boolean }) => ReactNode;
  onSelect: (item: T) => void;
  loading?: boolean;
  /** Message when the query has no results (only shown if query is non-empty). */
  emptyMessage?: ReactNode;
  /** Shown under the input, also tied via aria-describedby. */
  hint?: ReactNode;
  disabled?: boolean;
  size?: 'md' | 'lg';
  className?: string;
  /** Minimum characters before the list opens. */
  minChars?: number;
  id?: string;
}

/**
 * Accessible combobox following the WAI-ARIA 1.2 "list autocomplete" pattern:
 * input[role=combobox] + listbox with aria-activedescendant. Keyboard:
 * ↓/↑ move, Enter selects, Esc closes (second Esc clears), Tab leaves.
 * The result count is announced through a polite live region.
 */
export function Combobox<T>({
  label,
  hideLabel,
  placeholder,
  inputValue,
  onInputChange,
  items,
  getKey,
  getLabel,
  renderItem,
  onSelect,
  loading,
  emptyMessage = 'Nenhum resultado.',
  hint,
  disabled,
  size = 'md',
  className,
  minChars = 1,
  id,
}: ComboboxProps<T>) {
  const auto = useId();
  const inputId = id ?? `cb-${auto}`;
  const listId = `${inputId}-list`;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const listRef = useRef<HTMLUListElement>(null);

  const query = inputValue.trim();
  const showList = open && query.length >= minChars;
  const activeIndex = active >= 0 && active < items.length ? active : -1;
  const activeItem = activeIndex >= 0 ? items[activeIndex] : undefined;
  const optionId = (i: number) => `${inputId}-opt-${i}`;

  const announce = !showList
    ? ''
    : loading
      ? 'Buscando…'
      : items.length === 0
        ? 'Nenhum resultado.'
        : `${items.length} ${items.length === 1 ? 'resultado' : 'resultados'}. Use as setas para navegar.`;

  function select(item: T) {
    onSelect(item);
    setOpen(false);
    setActive(-1);
  }

  function move(next: number) {
    setActive(next);
    const el = listRef.current?.querySelector<HTMLElement>(`#${CSS.escape(optionId(next))}`);
    el?.scrollIntoView({ block: 'nearest' });
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    switch (e.key) {
      case 'ArrowDown': {
        e.preventDefault();
        if (!open) setOpen(true);
        if (items.length) move(activeIndex < items.length - 1 ? activeIndex + 1 : 0);
        break;
      }
      case 'ArrowUp': {
        e.preventDefault();
        if (!open) setOpen(true);
        if (items.length) move(activeIndex > 0 ? activeIndex - 1 : items.length - 1);
        break;
      }
      case 'Enter': {
        if (showList && activeItem !== undefined) {
          e.preventDefault();
          select(activeItem);
        } else if (showList && items.length === 1 && items[0] !== undefined) {
          e.preventDefault();
          select(items[0]);
        }
        break;
      }
      case 'Escape': {
        if (showList) {
          e.preventDefault();
          setOpen(false);
          setActive(-1);
        } else if (inputValue) {
          e.preventDefault();
          onInputChange('');
        }
        break;
      }
      default:
        break;
    }
  }

  return (
    <div className={cn('relative', className)}>
      <label
        htmlFor={inputId}
        className={cn('mb-1.5 block text-sm font-semibold text-primary', hideLabel && 'sr-only')}
      >
        {label}
      </label>
      <div className="relative">
        <Icon
          name="search"
          size={size === 'lg' ? 22 : 18}
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted"
        />
        <input
          id={inputId}
          type="text"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showList}
          aria-controls={listId}
          aria-activedescendant={showList && activeIndex >= 0 ? optionId(activeIndex) : undefined}
          aria-describedby={hintId}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="search"
          disabled={disabled}
          placeholder={placeholder}
          value={inputValue}
          onChange={(e) => {
            onInputChange(e.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            // Let option clicks (onMouseDown preventDefault) land first.
            setOpen(false);
            setActive(-1);
          }}
          onKeyDown={onKeyDown}
          className={cn(
            'block w-full rounded-md border border-border-strong bg-surface-raised text-primary placeholder:text-muted',
            'transition-[border-color,box-shadow] duration-(--duration-fast) ease-(--easing-standard) hover:border-secondary focus-visible:border-action',
            'disabled:cursor-not-allowed disabled:opacity-60',
            size === 'lg' ? 'min-h-14 pr-11 pl-11 text-lg' : 'min-h-11 pr-10 pl-10 text-base',
          )}
        />
        {loading ? (
          <Spinner size={18} className="absolute top-1/2 right-3 -translate-y-1/2 text-muted" />
        ) : inputValue ? (
          <button
            type="button"
            className="absolute top-1/2 right-1 grid size-11 -translate-y-1/2 place-items-center rounded-md text-muted hover:text-primary"
            aria-label="Limpar busca"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              onInputChange('');
              setActive(-1);
            }}
          >
            <Icon name="close" size={18} />
          </button>
        ) : null}
      </div>
      {hint ? (
        <p id={hintId} className="mt-1 text-sm text-muted">
          {hint}
        </p>
      ) : null}

      <ul
        ref={listRef}
        id={listId}
        role="listbox"
        aria-label={label}
        hidden={!showList}
        className={cn(
          'absolute inset-x-0 top-full z-(--z-dialog) mt-1 max-h-[min(22rem,60dvh)] overflow-y-auto rounded-md border border-border bg-surface-raised p-1 shadow-raised',
        )}
      >
        {showList && !loading && items.length === 0 ? (
          <li role="presentation" className="px-3 py-3 text-sm text-muted">
            {emptyMessage}
          </li>
        ) : null}
        {showList
          ? items.map((item, i) => {
              const isActive = i === activeIndex;
              return (
                <li
                  key={getKey(item)}
                  id={optionId(i)}
                  role="option"
                  aria-selected={isActive}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => select(item)}
                  onMouseMove={() => {
                    if (!isActive) setActive(i);
                  }}
                  className={cn(
                    'flex min-h-11 cursor-pointer items-center rounded-sm px-3 py-2 text-base text-primary',
                    isActive && 'bg-action-soft',
                  )}
                >
                  {renderItem ? renderItem(item, { active: isActive }) : getLabel(item)}
                </li>
              );
            })
          : null}
      </ul>
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {announce}
      </div>
    </div>
  );
}
