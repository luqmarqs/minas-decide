/**
 * Visual glyph of an activity point (same token as the map layer: --map-activity
 * with --map-activity-halo). On the map, activities are drawn by a clustered
 * WebGL circle layer (see MapCanvas) — never one DOM marker per activity.
 */
export function ActivityMarker({ size = 12, label }: { size?: number; label?: string }) {
  return (
    <span
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className="inline-block shrink-0 rounded-full bg-(--map-activity) ring-4 ring-(--map-activity-halo)"
      style={{ width: size, height: size }}
    />
  );
}
