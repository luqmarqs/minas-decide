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
export function fillExpression(
  p: MapPalette,
  layer: MapLayerCode,
  values: MapLayerValues | null | undefined,
): ExpressionSpecification | string {
  if (layer === 'activities' || !values) return p.none;
  const meta = LAYERS[layer];
  const diverging = meta.scale === 'diverging';
  const [a, b] = safeDomain(values.domain, diverging);
  // Values are GeoJSON properties (bucketed in the worker), not feature-state:
  // updating ~850 feature states on every layer change was main-thread work (P-PERF-1).
  const v: ExpressionSpecification = ['to-number', ['get', 'v'], 0];
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
