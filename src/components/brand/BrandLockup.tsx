import { cn } from '@/lib/cn';
import { SunMark } from './SunMark';

export interface BrandLockupProps {
  /** Mono: sun in the text colour (photographic / busy backgrounds). */
  mono?: boolean;
  /** Accessible name; omit when the parent (e.g. a link) already names it. */
  label?: string;
  className?: string;
}

/**
 * Horizontal lockup of the official identity: sun + "MINAS" (Anton) +
 * "DECIDE" (Bungee Outline). Sized for the 56 px header (a bit smaller on phones, so the header actions fit); both fonts are preloaded
 * in index.html.
 */
export function BrandLockup({ mono = false, label, className }: BrandLockupProps) {
  return (
    <span
      role={label ? 'img' : undefined}
      aria-label={label}
      className={cn('brand-lockup inline-flex items-end gap-1.5 leading-none', className)}
      data-mono={mono || undefined}
    >
      <SunMark
        size={38}
        className={cn(
          'mb-[3px] size-[30px] shrink-0 sm:size-[38px]',
          mono ? 'text-current' : 'text-(--brand-sun)',
        )}
      />
      <span
        aria-hidden="true"
        className="brand-display text-[1.3rem] tracking-[0.01em] sm:text-[1.6rem]"
      >
        MINAS
      </span>{' '}
      {/* whitespace is not rendered between flex items; it only keeps the visible text "MINAS DECIDE"
          matching the accessible name (axe label-content-name-mismatch). */}
      <span aria-hidden="true" className="brand-outline text-[1.15rem] sm:text-[1.45rem]">
        DECIDE
      </span>
    </span>
  );
}
