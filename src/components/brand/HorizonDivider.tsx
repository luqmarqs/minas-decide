const RIDGE =
  'M0 14L46 11L92 13L150 7L198 9L240 5L300 10L352 8L410 13L470 11L540 6L600 9L660 7L720 12' +
  'L790 9L850 4L905 8L960 6L1030 11L1090 9L1150 13L1210 8L1270 10L1330 6L1390 9L1440 8';

/**
 * "Horizonte da serra": irregular ochre ridge used as a divider between the brand
 * hero and the map (decorative, aria-hidden). Colour from --brand-ocre.
 */
export function HorizonDivider({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 1440 28"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
      className={className ?? 'brand-horizon'}
    >
      <path d={`${RIDGE}L1440 28L0 28Z`} fill="currentColor" />
      <path
        d={RIDGE}
        fill="none"
        stroke="var(--brand-ink, #202020)"
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
