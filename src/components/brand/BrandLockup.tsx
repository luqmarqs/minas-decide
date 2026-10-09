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
 * "DECIDE" (Bungee Outline). Sized for the 56 px header; both fonts are preloaded
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
        className={cn('mb-[3px] shrink-0', mono ? 'text-current' : 'text-(--brand-sun)')}
      />
      <span aria-hidden="true" className="brand-display text-[1.6rem] tracking-[0.01em]">
        MINAS
      </span>
      <span aria-hidden="true" className="brand-outline text-[1.45rem]">
        DECIDE
      </span>
    </span>
  );
}
