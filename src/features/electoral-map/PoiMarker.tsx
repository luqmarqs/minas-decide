import { Icon } from '@/components/ui/Icon';

/**
 * DOM glyph of a point of interest (same look as the map symbol: monochrome bus on
 * a cream/olive disc, --map-poi tokens). Decorative unless `label` is given.
 */
export function PoiMarker({ size = 14, label }: { size?: number; label?: string }) {
  const box = size + 10;
  return (
    <span
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className="inline-grid shrink-0 place-items-center rounded-full border-[1.5px] border-(--map-poi) bg-(--map-poi-bg) text-(--map-poi)"
      style={{ width: box, height: box }}
    >
      <Icon name="bus" size={size} />
    </span>
  );
}
