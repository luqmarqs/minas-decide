import { SunMark } from '@/components/brand/SunMark';
import { useBrandActive } from '@/lib/brand';

/**
 * Visual glyph of an activity point (same token as the map layer: --map-activity
 * with --map-activity-halo). On the map, activities are drawn by a clustered
 * WebGL circle layer (see MapCanvas) — never one DOM marker per activity.
 * Official identity (default): a small sun in --map-activity on a halo disc;
 * the round dot only remains under the `provisorio` rollback theme.
 */
export function ActivityMarker({ size = 12, label }: { size?: number; label?: string }) {
  const brand = useBrandActive();
  const a11y = {
    role: label ? 'img' : undefined,
    'aria-label': label,
    'aria-hidden': label ? undefined : true,
  } as const;
  if (brand) {
    const box = size + 10;
    return (
      <span
        {...a11y}
        data-brand-marker=""
        className="inline-grid shrink-0 place-items-center rounded-full bg-(--map-activity-halo) text-(--map-activity)"
        style={{ width: box, height: box }}
      >
        <SunMark size={size + 4} />
      </span>
    );
  }
  return (
    <span
      {...a11y}
      className="inline-block shrink-0 rounded-full bg-(--map-activity) ring-4 ring-(--map-activity-halo)"
      style={{ width: size, height: size }}
    />
  );
}
