/**
 * Pure helpers for MapCanvas (kept apart so they are unit-testable and the
 * component module only exports the component).
 */
import type { ExpressionSpecification, StyleSpecification } from 'maplibre-gl';
import type { MapLayerCode, MapLayerValues } from '@shared/contracts/metrics.ts';
import { LAYERS } from './layers';
import { safeDomain, type MapPalette } from './palette';

/** OpenFreeMap styles: light (positron) and dark, switched with prefers-color-scheme (P-UX-3). */
export const BASEMAP_STYLE_URLS = {
  light: 'https://tiles.openfreemap.org/styles/positron',
  dark: 'https://tiles.openfreemap.org/styles/dark',
} as const;

/**
 * Basemap layers that add main-thread work (symbol placement, extra buckets) but no
 * context for a choropleth of municipalities: buildings, airports, railways,
 * one-way arrows and road shields (P-PERF-1).
 */
const DROPPED_BASEMAP_LAYER =
  /^(building|aeroway|airport|railway|road_oneway|highway-shield|road_shield|landcover_(ice|glacier))/;

export function trimBasemapStyle(style: StyleSpecification): StyleSpecification {
  return { ...style, layers: style.layers.filter((l) => !DROPPED_BASEMAP_LAYER.test(l.id)) };
}
/** MapLibre layer ids of the overlays (clusters, counts, points). */
export const ACTIVITY_LAYER_IDS = ['mm-act-clusters', 'mm-act-count', 'mm-act-points'] as const;
export const POI_LAYER_IDS = ['mm-poi-clusters', 'mm-poi-count', 'mm-poi-points'] as const;

/**
 * Overlay visibility depends ONLY on its switch, never on the statistical layer
 * (rodada 3: activities are always on the map, above any choropleth).
 */
export function overlayVisibility(enabled: boolean): 'visible' | 'none' {
  return enabled ? 'visible' : 'none';
}

export function fillExpression(
  p: MapPalette,
  layer: MapLayerCode,
  values: MapLayerValues | null | undefined,
): ExpressionSpecification | string {
  if (LAYERS[layer].scale === 'none' || !values) return p.none;
  const meta = LAYERS[layer];
  const diverging = meta.scale === 'diverging';
  const [a, b] = safeDomain(values.domain, diverging);
  // Values are GeoJSON properties (bucketed in the worker), not feature-state:
  // updating ~850 feature states on every layer change was main-thread work (P-PERF-1).
  const v: ExpressionSpecification = ['to-number', ['get', 'v'], 0];
  if (meta.palette === 'partisan') return ['case', ['has', 'v'], marginRamp(p, v, b), p.none];
  const ramp: ExpressionSpecification = diverging
    ? ['interpolate', ['linear'], v, a, p.diverging[0], 0, p.diverging[1], b, p.diverging[2]]
    : [
        'interpolate',
        ['linear'],
        v,
        a,
        p.sequential[0],
        a + (b - a) * 0.25,
        p.sequential[1],
        a + (b - a) * 0.5,
        p.sequential[2],
        a + (b - a) * 0.75,
        p.sequential[3],
        b,
        p.sequential[4],
      ];
  return ['case', ['has', 'v'], ramp, p.none];
}

/** D25 partisan ramp (president_margin only): −m Bolsonaro … 0 neutral … +m Lula. */
export function marginRamp(
  p: MapPalette,
  v: ExpressionSpecification,
  m: number,
): ExpressionSpecification {
  return [
    'interpolate',
    ['linear'],
    v,
    -m,
    p.margin[0],
    -m / 3,
    p.margin[1],
    0,
    p.margin[2],
    m / 3,
    p.margin[3],
    m,
    p.margin[4],
  ];
}
