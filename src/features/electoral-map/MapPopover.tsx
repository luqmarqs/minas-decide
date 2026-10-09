import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/cn';
import { useDismiss } from './useDismiss';

export interface MapPopoverProps {
  title: ReactNode;
  /** Small line above the title (type/category, badges). */
  eyebrow?: ReactNode;
  children: ReactNode;
  onClose: () => void;
  closeLabel: string;
  className?: string;
  testId?: string;
}

/**
 * Non-modal popover over the map (activity / point of interest). It is a labelled
 * `dialog` that receives focus when it opens, closes with Esc or the close button and
 * never traps focus — the map and the page stay usable behind it. Placement is fixed
 * (bottom of the map, above the mobile sheet) rather than anchored to the marker, so it
 * never leaves the viewport on small screens. A tap outside closes it too (FE-10).
 */
export function MapPopover({
  title,
  eyebrow,
  children,
  onClose,
  closeLabel,
  className,
  testId,
}: MapPopoverProps) {
  const titleId = useId();
  const ref = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });
  useDismiss(ref, onClose);
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
    // Esc with focus inside the popover closes the popover only. Window capture runs before
    // the document-level listener of the (Radix) territory sheet, which would close the sheet.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !ref.current?.contains(document.activeElement)) return;
      e.stopPropagation();
      onCloseRef.current();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, []);
  return (
    <div
      ref={ref}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      tabIndex={-1}
      data-testid={testId}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onCloseRef.current();
        }
      }}
      className={cn(
        'relative rounded-md border border-border bg-surface-raised p-3 pr-12 text-primary shadow-raised outline-none',
        'focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-focus',
        className,
      )}
    >
      {eyebrow ? <div className="mb-1 flex flex-wrap items-center gap-1.5">{eyebrow}</div> : null}
      <h2 id={titleId} className="font-body text-base leading-snug font-semibold tracking-normal">
        {title}
      </h2>
      <div className="mt-2 flex flex-col gap-2 text-sm">{children}</div>
      <button
        type="button"
        className="absolute top-1 right-1 grid size-11 place-items-center rounded-md text-secondary hover:bg-surface-alt"
        aria-label={closeLabel}
        onClick={onClose}
      >
        <Icon name="close" size={18} />
      </button>
    </div>
  );
}
