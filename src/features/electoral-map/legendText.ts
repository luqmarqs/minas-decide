import type { MapLayerCode, MapLayerValues } from '@shared/contracts/metrics.ts';
import { formatLayerValue, LAYERS } from './layers';
import { MARGIN_GRADIENT, safeDomain } from './palette';

/** Gradient of the active layer (same ramps as the full legend). */
export function legendGradient(layer: MapLayerCode): string {
  const meta = LAYERS[layer];
  if (layer === 'president_margin') return MARGIN_GRADIENT;
  if (meta.scale === 'diverging')
    return 'linear-gradient(to right, var(--map-diverging-neg), var(--map-diverging-zero), var(--map-diverging-pos))';
  return 'linear-gradient(to right, var(--map-fill-low), var(--map-fill-mid-low), var(--map-fill-mid), var(--map-fill-mid-high), var(--map-fill-high))';
}

/** Text of the collapsed legend chip, e.g. "Abstenção · 14,2% – 40,1%". */
export function legendChipText(
  layer: MapLayerCode,
  values: MapLayerValues | null | undefined,
): string {
  const meta = LAYERS[layer];
  if (meta.scale === 'none' || !values) return meta.label;
  const [a, b] = safeDomain(values.domain, meta.scale === 'diverging');
  return `${meta.short} · ${formatLayerValue(layer, a)} – ${formatLayerValue(layer, b)}`;
}
