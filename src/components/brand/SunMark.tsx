import type { SVGProps } from 'react';
import { SUN_PATH, SUN_VIEWBOX } from './sunGeometry';

export interface SunMarkProps extends Omit<SVGProps<SVGSVGElement>, 'viewBox' | 'children'> {
  /** Rendered width in px (height follows the 100:54 aspect). */
  size?: number;
}

/**
 * "Minas Decide" sun symbol (vector, drawn after the artwork): half disc + 11 wavy
 * rays. Colour comes from `currentColor`; always decorative (`aria-hidden`) — the
 * accessible name belongs to the surrounding link/lockup.
 */
export function SunMark({ size = 32, className, ...rest }: SunMarkProps) {
  const { width, height } = SUN_VIEWBOX;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${width} ${height}`}
      width={size}
      height={Math.round((size * height) / width)}
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      className={className}
      {...rest}
    >
      <path d={SUN_PATH} />
    </svg>
  );
}
