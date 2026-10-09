/**
 * MapLibre canvas. Loaded ONLY through React.lazy from MapShell, so maplibre-gl
 * (and its CSS) live in a separate chunk. Rendering rules:
 * - municipalities: IBGE polygons (lazy fetched GeoJSON) coloured through
 *   GeoJSON properties (bucketed in the worker; feature-state only for hover); centroid circles if the mesh fails;
 * - neighborhoods: approximate AREAS (Voronoi of the polling places, generated offline, D29;
 *   never official boundaries) coloured by the active layer, for the selected municipality
 *   and — from zoom ≥ AUTO_AREAS_MIN_ZOOM — for every municipality on screen (≤ 12, FE-10);
 *   the selected one is outlined; points remain as fallback where there is no area. Labels:
 *   municipality names between zoom 8 and 12, neighborhood names from zoom 12;
 * - activities: clustered GeoJSON source (WebGL, no DOM markers), drawn as a sun with halo
 *   ABOVE any statistical layer (rodada 3: an overlay, on by default);
 * - points of interest (terminals/stations, OSM): clustered overlay, off by default;
 * - colours from --map-* tokens; camera moves use --duration-map (0 when reduced motion);
 * - cooperativeGestures so the page scroll is never hijacked.
 */
import 'maplibre-gl/dist/maplibre-gl.css';
// MapLibre resolves its worker relative to its own module URL, which breaks under
// Vite (pre-bundled deps in dev, hashed chunks in build). Emit it as an asset instead.
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import {
  LngLatBounds,
  Map as MapLibreMap,
  NavigationControl,
  setWorkerUrl,
  type GeoJSONSource,
  type MapLayerMouseEvent,
  type StyleSpecification,
} from 'maplibre-gl';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { PublicActivity } from '@shared/contracts/activities.ts';
import type { MapLayerCode, MapLayerValues } from '@shared/contracts/metrics.ts';
import { municipalityIdOf, type PoiFile } from '@shared/contracts/snapshot.ts';
import { cssDurationMs, prefersReducedMotion } from '@/lib/media';
import type { TerritoryIndex } from './hooks';
import { formatLayerValue, LAYERS } from './layers';
import { readMapPalette, type MapPalette } from './palette';
import {
  ACTIVITY_LAYER_IDS,
  BASEMAP_STYLE_URLS,
  fillExpression,
  neighborhoodColor,
  overlayVisibility,
  POI_LAYER_IDS,
  trimBasemapStyle,
} from './mapExpressions';
import { drawPoiIcon, drawSunIcon, ICON_POI, ICON_SUN } from './mapIcons';
import {
  loadNeighborhoodAreas,
  visibleMunicipalities,
  type BBox,
  type NeighborhoodAreas,
} from './neighborhoodAreas';

setWorkerUrl(maplibreWorkerUrl);

const MG_BOUNDS: [[number, number], [number, number]] = [
  [-51.1, -22.95],
  [-39.8, -14.2],
];
const MAX_BOUNDS: [[number, number], [number, number]] = [
  [-56, -26.5],
  [-35, -10.5],
];
const GEO_URL = '/geo/mg-municipios.geojson';

// Minimal GeoJSON types (structurally compatible with MapLibre's setData input).
type Position = [number, number];
interface GeoPoint {
  type: 'Point';
  coordinates: Position;
}
interface GeoPolygon {
  type: 'Polygon';
  coordinates: Position[][];
}
interface GeoMultiPolygon {
  type: 'MultiPolygon';
  coordinates: Position[][][];
}
type GeoGeometry = GeoPoint | GeoPolygon | GeoMultiPolygon;
interface GeoFeature<G extends GeoGeometry = GeoGeometry, P = Record<string, unknown>> {
  type: 'Feature';
  geometry: G;
  properties: P;
}
interface GeoFeatureCollection<G extends GeoGeometry = GeoGeometry, P = Record<string, unknown>> {
  type: 'FeatureCollection';
  features: GeoFeature<G, P>[];
}

const SRC_MUNI = 'mm-municipalities';
const SRC_MUNI_PTS = 'mm-municipality-points';
const SRC_NEIGH = 'mm-neighborhoods';
const SRC_NEIGH_AREA = 'mm-neighborhood-areas';
const SRC_ACT = 'mm-activities';
const SRC_POI = 'mm-pois';

export type BasemapProblem = 'style' | 'tiles';

export interface MapCanvasProps {
  index: TerritoryIndex;
  selectedId: string | null;
  layer: MapLayerCode;
  layerValues: MapLayerValues | null | undefined;
  /** Values for neighborhoods of the municipalities with areas (territory_id → value). */
  neighborhoodValues: Record<string, number> | null;
  /** Municipalities whose neighborhood areas are drawn (selected first; FE-10). */
  onAreaMunicipalitiesChange?: (ids: string[]) => void;
  activities: PublicActivity[];
  /** Activities overlay switch (on by default; independent of the statistical layer). */
  showActivities?: boolean;
  /** Points of interest (OSM terminals/stations) and their switch. */
  pois?: PoiFile['items'] | null;
  showPois?: boolean;
  onSelect: (id: string | null) => void;
  onActivitySelect: (id: string) => void;
  onPoiSelect?: (id: string) => void;
  onFatalError: () => void;
  onBasemapProblem: (p: BasemapProblem) => void;
  /** Extra right padding (desktop side panel) and bottom padding (mobile sheet). */
  padding: { top?: number; right: number; bottom: number };
  ariaLabel?: string;
  /** Dark basemap. The parent remounts the canvas (key) when the scheme changes. */
  dark?: boolean;
}

interface HoverInfo {
  x: number;
  y: number;
  title: string;
  value: string;
}

type Geo = GeoFeatureCollection<GeoPolygon | GeoMultiPolygon, { codarea: string }>;
let geoPromise: Promise<Geo> | null = null;
function loadMunicipalGeo(): Promise<Geo> {
  geoPromise ??= fetch(GEO_URL, {
    headers: { Accept: 'application/geo+json, application/json' },
  }).then(async (r) => {
    const type = r.headers.get('content-type') ?? '';
    if (!r.ok || type.includes('text/html')) throw new Error(`geo ${r.status}`);
    const json = (await r.json()) as Geo;
    if (json?.type !== 'FeatureCollection' || !Array.isArray(json.features))
      throw new Error('geo invalid');
    return json;
  });
  geoPromise.catch(() => {
    geoPromise = null;
  });
  return geoPromise;
}

function bboxOf(geom: GeoPolygon | GeoMultiPolygon): [number, number, number, number] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const rings = geom.type === 'Polygon' ? geom.coordinates : geom.coordinates.flat();
  for (const ring of rings) {
    for (const [x, y] of ring) {
      if (x === undefined || y === undefined) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  return [minX, minY, maxX, maxY];
}

async function loadBaseStyle(signal: AbortSignal, dark: boolean): Promise<StyleSpecification> {
  const timeout = AbortSignal.timeout(8000);
  const url = dark ? BASEMAP_STYLE_URLS.dark : BASEMAP_STYLE_URLS.light;
  const res = await fetch(url, { signal: AbortSignal.any([signal, timeout]) });
  if (!res.ok) throw new Error(`style ${res.status}`);
  return trimBasemapStyle((await res.json()) as StyleSpecification);
}

function fallbackStyle(p: MapPalette): StyleSpecification {
  return {
    version: 8,
    sources: {},
    layers: [
      { id: 'mm-background', type: 'background', paint: { 'background-color': p.surfaceAlt } },
    ],
  };
}

export default function MapCanvas(props: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const propsRef = useRef(props);
  const bboxesRef = useRef<Map<string, [number, number, number, number]>>(new Map());
  const geoRef = useRef<Geo | null>(null);
  const hoverRef = useRef<{ source: string; id: string | number } | null>(null);
  const lastCameraRef = useRef<string | null | undefined>(undefined);
  const [ready, setReady] = useState(false);
  const [geoState, setGeoState] = useState<'loading' | 'ok' | 'failed'>('loading');
  const [hover, setHover] = useState<HoverInfo | null>(null);
  // Viewport (bounds + zoom) at the end of each camera move: drives the automatic areas.
  const [view, setView] = useState<{ box: BBox; zoom: number } | null>(null);
  const [muniBoxes, setMuniBoxes] = useState<ReadonlyMap<string, BBox>>(() => new Map());

  useEffect(() => {
    propsRef.current = props;
  });

  // ---- init -------------------------------------------------------------
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ctrl = new AbortController();
    let map: MapLibreMap | null = null;
    let disposed = false;
    let tileErrors = 0;
    const palette = readMapPalette();

    (async () => {
      let style: StyleSpecification;
      try {
        style = await loadBaseStyle(ctrl.signal, !!propsRef.current.dark);
      } catch {
        if (disposed) return;
        propsRef.current.onBasemapProblem('style');
        style = fallbackStyle(palette);
      }
      if (disposed) return;
      try {
        map = new MapLibreMap({
          container,
          style,
          bounds: MG_BOUNDS,
          fitBoundsOptions: { padding: 16 },
          maxBounds: MAX_BOUNDS,
          minZoom: 4,
          maxZoom: 15,
          attributionControl: false,
          // No label fade-in frames: less main-thread work on slow phones (P-PERF-1).
          fadeDuration: 0,
          cooperativeGestures: true,
          dragRotate: false,
          pitchWithRotate: false,
          touchPitch: false,
          locale: {
            'Map.Title': 'Mapa',
            'NavigationControl.ZoomIn': 'Aproximar',
            'NavigationControl.ZoomOut': 'Afastar',
            'NavigationControl.ResetBearing': 'Restaurar orientação',
            'CooperativeGesturesHandler.WindowsHelpText':
              'Use Ctrl + rolagem para aproximar o mapa',
            'CooperativeGesturesHandler.MacHelpText': 'Use ⌘ + rolagem para aproximar o mapa',
            'CooperativeGesturesHandler.MobileHelpText': 'Use dois dedos para mover o mapa',
          },
        });
      } catch {
        propsRef.current.onFatalError();
        return;
      }
      mapRef.current = map;
      map.touchZoomRotate.disableRotation();
      map.addControl(new NavigationControl({ showCompass: false }), 'bottom-right');
      map
        .getCanvas()
        .setAttribute(
          'aria-label',
          propsRef.current.ariaLabel ?? 'Mapa interativo de Minas Gerais',
        );
      map.on('webglcontextlost', () => propsRef.current.onFatalError());
      map.on('error', (e) => {
        const sourceId = (e as unknown as { sourceId?: string }).sourceId;
        if (sourceId && !sourceId.startsWith('mm-')) {
          tileErrors += 1;
          if (tileErrors === 3) propsRef.current.onBasemapProblem('tiles');
        }
      });

      map.on('load', () => {
        if (!map) return;
        const beforeId = map.getStyle().layers.find((l) => l.type === 'symbol')?.id;
        const hasGlyphs = !!map.getStyle().glyphs;
        const empty: GeoFeatureCollection = { type: 'FeatureCollection', features: [] };

        map.addSource(SRC_MUNI, { type: 'geojson', data: empty, promoteId: 'codarea' });
        map.addSource(SRC_MUNI_PTS, { type: 'geojson', data: empty, promoteId: 'codarea' });
        map.addSource(SRC_NEIGH, { type: 'geojson', data: empty, promoteId: 'id' });
        map.addSource(SRC_NEIGH_AREA, {
          type: 'geojson',
          data: empty,
          promoteId: 'territory_id',
        });
        map.addSource(SRC_POI, {
          type: 'geojson',
          data: empty,
          cluster: true,
          clusterRadius: 40,
          clusterMaxZoom: 11,
        });
        map.addSource(SRC_ACT, {
          type: 'geojson',
          data: empty,
          cluster: true,
          clusterRadius: 44,
          clusterMaxZoom: 12,
        });

        map.addLayer(
          {
            id: 'mm-muni-fill',
            type: 'fill',
            source: SRC_MUNI,
            paint: { 'fill-color': palette.none, 'fill-opacity': 0.8 },
          },
          beforeId,
        );
        map.addLayer(
          {
            id: 'mm-muni-line',
            type: 'line',
            source: SRC_MUNI,
            paint: {
              'line-color': palette.stroke,
              'line-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.9, 0.18],
              'line-width': ['case', ['boolean', ['feature-state', 'hover'], false], 1.6, 0.5],
            },
          },
          beforeId,
        );
        map.addLayer(
          {
            // Invisible by default (transparent token); the minas-decide variant uses an ink
            // casing because yellow alone has < 3:1 against the light basemap.
            id: 'mm-muni-selected-casing',
            type: 'line',
            source: SRC_MUNI,
            filter: ['==', ['get', 'codarea'], ''],
            paint: { 'line-color': palette.selectedCasing, 'line-width': 5.5 },
          },
          beforeId,
        );
        map.addLayer(
          {
            id: 'mm-muni-selected',
            type: 'line',
            source: SRC_MUNI,
            filter: ['==', ['get', 'codarea'], ''],
            paint: { 'line-color': palette.selected, 'line-width': 3 },
          },
          beforeId,
        );
        map.addLayer(
          {
            id: 'mm-muni-circles',
            type: 'circle',
            source: SRC_MUNI_PTS,
            layout: { visibility: 'none' },
            paint: {
              'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 5, 10, 12],
              'circle-color': palette.none,
              'circle-stroke-color': palette.stroke,
              'circle-stroke-width': 0.6,
            },
          },
          beforeId,
        );
        // Neighborhood areas (D29): fill by the active layer, thin outlines, selected outline
        // (yellow over an ink casing, like the municipality).
        map.addLayer(
          {
            id: 'mm-neigh-fill',
            type: 'fill',
            source: SRC_NEIGH_AREA,
            paint: { 'fill-color': palette.none, 'fill-opacity': 0.85 },
          },
          beforeId,
        );
        map.addLayer(
          {
            id: 'mm-neigh-line',
            type: 'line',
            source: SRC_NEIGH_AREA,
            paint: {
              'line-color': palette.stroke,
              'line-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.9, 0.35],
              'line-width': ['case', ['boolean', ['feature-state', 'hover'], false], 1.6, 0.5],
            },
          },
          beforeId,
        );
        map.addLayer(
          {
            id: 'mm-neigh-selected-casing',
            type: 'line',
            source: SRC_NEIGH_AREA,
            filter: ['==', ['get', 'territory_id'], ''],
            paint: { 'line-color': palette.selectedCasing, 'line-width': 5 },
          },
          beforeId,
        );
        map.addLayer(
          {
            id: 'mm-neigh-selected',
            type: 'line',
            source: SRC_NEIGH_AREA,
            filter: ['==', ['get', 'territory_id'], ''],
            paint: { 'line-color': palette.selected, 'line-width': 2.6 },
          },
          beforeId,
        );
        if (hasGlyphs) {
          // Names (FE-10): municipalities between zoom 8 and 12, neighborhoods from 12.
          // Cream/ink halo (surface token), no overlap, basemap font.
          const labelPaint = {
            'text-color': palette.textPrimary,
            'text-halo-color': palette.surface,
            'text-halo-width': 1.6,
          };
          map.addLayer({
            id: 'mm-muni-label',
            type: 'symbol',
            source: SRC_MUNI,
            minzoom: 8,
            maxzoom: 12,
            filter: ['has', 'name'],
            layout: {
              'text-field': ['get', 'name'],
              'text-font': ['Noto Sans Bold'],
              'text-size': ['interpolate', ['linear'], ['zoom'], 8, 11, 11, 13],
              'text-allow-overlap': false,
              'text-padding': 4,
              'text-max-width': 8,
            },
            paint: labelPaint,
          });
          map.addLayer({
            id: 'mm-neigh-label',
            type: 'symbol',
            source: SRC_NEIGH_AREA,
            minzoom: 12,
            filter: ['has', 'name'],
            layout: {
              'text-field': ['get', 'name'],
              'text-font': ['Noto Sans Regular'],
              'text-size': ['interpolate', ['linear'], ['zoom'], 12, 11, 15, 13],
              'text-allow-overlap': false,
              'text-padding': 3,
              'text-max-width': 7,
            },
            paint: labelPaint,
          });
        }
        map.addLayer({
          id: 'mm-neigh',
          type: 'circle',
          source: SRC_NEIGH,
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 4, 13, 9],
            'circle-color': palette.none,
            'circle-stroke-color': [
              'case',
              ['boolean', ['get', 'selected'], false],
              palette.selected,
              palette.stroke,
            ],
            'circle-stroke-width': [
              'case',
              ['boolean', ['get', 'selected'], false],
              3,
              ['boolean', ['feature-state', 'hover'], false],
              2,
              1,
            ],
          },
        });
        // ---- overlays: POIs (below) and activities (always on top) ----
        const ratio = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
        const sunImg = drawSunIcon(palette, ratio);
        const poiImg = drawPoiIcon(palette, ratio);
        if (sunImg) map.addImage(ICON_SUN, sunImg, { pixelRatio: ratio });
        if (poiImg) map.addImage(ICON_POI, poiImg, { pixelRatio: ratio });

        map.addLayer({
          id: 'mm-poi-clusters',
          type: 'circle',
          source: SRC_POI,
          filter: ['has', 'point_count'],
          layout: { visibility: 'none' },
          paint: {
            'circle-color': palette.poiBg,
            'circle-radius': ['step', ['get', 'point_count'], 12, 10, 15, 50, 19],
            'circle-stroke-color': palette.poi,
            'circle-stroke-width': 1.5,
          },
        });
        if (hasGlyphs) {
          map.addLayer({
            id: 'mm-poi-count',
            type: 'symbol',
            source: SRC_POI,
            filter: ['has', 'point_count'],
            layout: {
              visibility: 'none',
              'text-field': ['get', 'point_count_abbreviated'],
              'text-font': ['Noto Sans Bold'],
              'text-size': 11,
              'text-allow-overlap': true,
            },
            paint: { 'text-color': palette.poi },
          });
        }
        if (poiImg) {
          map.addLayer({
            id: 'mm-poi-points',
            type: 'symbol',
            source: SRC_POI,
            filter: ['!', ['has', 'point_count']],
            layout: {
              visibility: 'none',
              'icon-image': ICON_POI,
              'icon-allow-overlap': true,
              'icon-ignore-placement': true,
            },
          });
        } else {
          map.addLayer({
            id: 'mm-poi-points',
            type: 'circle',
            source: SRC_POI,
            filter: ['!', ['has', 'point_count']],
            layout: { visibility: 'none' },
            paint: {
              'circle-color': palette.poiBg,
              'circle-radius': 6,
              'circle-stroke-color': palette.poi,
              'circle-stroke-width': 2,
            },
          });
        }

        map.addLayer({
          id: 'mm-act-clusters',
          type: 'circle',
          source: SRC_ACT,
          filter: ['has', 'point_count'],
          layout: { visibility: 'none' },
          paint: {
            'circle-color': palette.activity,
            'circle-opacity': 0.95,
            'circle-radius': ['step', ['get', 'point_count'], 15, 10, 19, 50, 25],
            'circle-stroke-color': palette.activityHalo,
            'circle-stroke-width': 6,
          },
        });
        if (hasGlyphs) {
          map.addLayer({
            id: 'mm-act-count',
            type: 'symbol',
            source: SRC_ACT,
            filter: ['has', 'point_count'],
            layout: {
              visibility: 'none',
              'text-field': ['get', 'point_count_abbreviated'],
              'text-font': ['Noto Sans Bold'],
              'text-size': 12,
              'text-allow-overlap': true,
            },
            paint: { 'text-color': palette.surface },
          });
        }
        if (sunImg) {
          map.addLayer({
            id: 'mm-act-points',
            type: 'symbol',
            source: SRC_ACT,
            filter: ['!', ['has', 'point_count']],
            layout: {
              visibility: 'none',
              'icon-image': ICON_SUN,
              'icon-allow-overlap': true,
              'icon-ignore-placement': true,
            },
          });
        } else {
          map.addLayer({
            id: 'mm-act-points',
            type: 'circle',
            source: SRC_ACT,
            filter: ['!', ['has', 'point_count']],
            layout: { visibility: 'none' },
            paint: {
              'circle-color': palette.activity,
              'circle-radius': 7,
              'circle-stroke-color': palette.activityHalo,
              'circle-stroke-width': 6,
            },
          });
        }

        // ---- interaction ----
        const setHoverState = (source: string, id: string | number | undefined) => {
          const m = mapRef.current;
          if (!m) return;
          if (hoverRef.current) m.setFeatureState(hoverRef.current, { hover: false });
          hoverRef.current = id === undefined ? null : { source, id };
          if (hoverRef.current) m.setFeatureState(hoverRef.current, { hover: true });
        };

        const muniHover = (e: MapLayerMouseEvent) => {
          const f = e.features?.[0];
          const code = f?.properties?.codarea as string | undefined;
          const p = propsRef.current;
          const entry = code ? p.index.byId.get(`mg-${code}`) : undefined;
          if (!f || !entry) {
            map!.getCanvas().style.cursor = '';
            setHoverState(SRC_MUNI, undefined);
            setHover(null);
            return;
          }
          map!.getCanvas().style.cursor = 'pointer';
          setHoverState(e.features?.[0]?.source === SRC_MUNI_PTS ? SRC_MUNI_PTS : SRC_MUNI, code);
          const v = p.layerValues?.values[entry.id];
          setHover({
            x: e.point.x,
            y: e.point.y,
            title: `${entry.name}/MG`,
            value:
              LAYERS[p.layer].scale === 'none'
                ? ''
                : `${LAYERS[p.layer].short}: ${formatLayerValue(p.layer, v)}`,
          });
        };
        const muniLeave = () => {
          map!.getCanvas().style.cursor = '';
          setHoverState(SRC_MUNI, undefined);
          setHover(null);
        };
        const muniClick = (e: MapLayerMouseEvent) => {
          const p = propsRef.current;
          // Overlay markers sit on top of the choropleth: their own handlers win.
          const overlayIds = [...ACTIVITY_LAYER_IDS, ...POI_LAYER_IDS].filter((id) =>
            map!.getLayer(id),
          );
          if (
            overlayIds.length &&
            map!.queryRenderedFeatures(e.point, { layers: overlayIds }).length
          )
            return;
          const neigh = map!.queryRenderedFeatures(e.point, {
            layers: ['mm-neigh', 'mm-neigh-fill'],
          });
          if (neigh.length) return;
          const code = e.features?.[0]?.properties?.codarea as string | undefined;
          if (code && p.index.byId.has(`mg-${code}`)) p.onSelect(`mg-${code}`);
        };
        for (const id of ['mm-muni-fill', 'mm-muni-circles']) {
          map.on('mousemove', id, muniHover);
          map.on('mouseleave', id, muniLeave);
          map.on('click', id, muniClick);
        }

        map.on('mousemove', 'mm-neigh', (e) => {
          const f = e.features?.[0];
          const id = f?.properties?.id as string | undefined;
          const p = propsRef.current;
          const entry = id ? p.index.byId.get(id) : undefined;
          if (!entry) return;
          map!.getCanvas().style.cursor = 'pointer';
          setHoverState(SRC_NEIGH, id);
          const v = f?.properties?.v as number | undefined;
          setHover({
            x: e.point.x,
            y: e.point.y,
            title: `${entry.name} (bairro aprox.)`,
            value:
              LAYERS[p.layer].scale === 'none'
                ? ''
                : `${LAYERS[p.layer].short}: ${formatLayerValue(p.layer, v ?? null)}`,
          });
        });
        map.on('mouseleave', 'mm-neigh', muniLeave);
        map.on('mousemove', 'mm-neigh-fill', (e) => {
          const f = e.features?.[0];
          const id = f?.properties?.territory_id as string | undefined;
          const p = propsRef.current;
          if (!id) return;
          const entry = p.index.byId.get(id);
          map!.getCanvas().style.cursor = 'pointer';
          setHoverState(SRC_NEIGH_AREA, id);
          const v = f?.properties?.v as number | undefined;
          setHover({
            x: e.point.x,
            y: e.point.y,
            title: `${entry?.name ?? (f?.properties?.name as string) ?? id} (bairro, área aprox.)`,
            value:
              LAYERS[p.layer].scale === 'none'
                ? ''
                : `${LAYERS[p.layer].short}: ${formatLayerValue(p.layer, v ?? null)}`,
          });
        });
        map.on('mouseleave', 'mm-neigh-fill', muniLeave);
        map.on('click', 'mm-neigh-fill', (e) => {
          const p = propsRef.current;
          const overlayIds = [...ACTIVITY_LAYER_IDS, ...POI_LAYER_IDS].filter((id) =>
            map!.getLayer(id),
          );
          if (
            overlayIds.length &&
            map!.queryRenderedFeatures(e.point, { layers: overlayIds }).length
          )
            return;
          if (map!.queryRenderedFeatures(e.point, { layers: ['mm-neigh'] }).length) return;
          const id = e.features?.[0]?.properties?.territory_id as string | undefined;
          if (id && p.index.byId.has(id)) p.onSelect(id);
        });
        map.on('click', 'mm-neigh', (e) => {
          const id = e.features?.[0]?.properties?.id as string | undefined;
          if (id) propsRef.current.onSelect(id);
        });

        const expandCluster = async (sourceId: string, e: MapLayerMouseEvent) => {
          const f = e.features?.[0];
          const clusterId = f?.properties?.cluster_id as number | undefined;
          const src = map!.getSource<GeoJSONSource>(sourceId);
          if (clusterId === undefined || !src || f?.geometry.type !== 'Point') return;
          const zoom = await src.getClusterExpansionZoom(clusterId);
          map!.easeTo({
            center: f.geometry.coordinates as [number, number],
            zoom,
            duration: prefersReducedMotion() ? 0 : cssDurationMs('--duration-map', 500),
          });
        };
        const activityOnTop = (e: MapLayerMouseEvent) =>
          map!.queryRenderedFeatures(e.point, { layers: ['mm-act-points', 'mm-act-clusters'] })
            .length > 0;
        map.on('click', 'mm-act-clusters', (e) => void expandCluster(SRC_ACT, e));
        map.on('click', 'mm-poi-clusters', (e) => {
          if (!activityOnTop(e)) void expandCluster(SRC_POI, e);
        });
        map.on('click', 'mm-act-points', (e) => {
          const id = e.features?.[0]?.properties?.id as string | undefined;
          if (id) propsRef.current.onActivitySelect(id);
        });
        map.on('click', 'mm-poi-points', (e) => {
          if (activityOnTop(e)) return;
          const id = e.features?.[0]?.properties?.id as string | undefined;
          if (id) propsRef.current.onPoiSelect?.(id);
        });
        // Viewport for the automatic neighborhood areas (only at the end of a move).
        const publishView = () => {
          if (!map) return;
          const b = map.getBounds();
          setView({
            box: [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()],
            zoom: map.getZoom(),
          });
        };
        map.on('moveend', publishView);
        publishView();
        // Test hook (e2e only, no data): `mm-test-jump` CustomEvent moves the camera.
        containerRef.current?.addEventListener('mm-test-jump', (ev) => {
          const d = (ev as CustomEvent<{ center: [number, number]; zoom: number }>).detail;
          if (d?.center) map?.jumpTo({ center: d.center, zoom: d.zoom });
        });
        // Test/diagnostic hook (no PII): zoom and screen position of visible activity points.
        map.on('idle', () => {
          const el = containerRef.current;
          if (!el || !map) return;
          el.dataset.zoom = map.getZoom().toFixed(2);
          // Neighborhood areas on screen and the outlined (selected) one (D29).
          el.dataset.neighborhoodAreas = String(
            map.queryRenderedFeatures({ layers: ['mm-neigh-fill'] }).length,
          );
          el.dataset.selectedArea = String(
            map.queryRenderedFeatures({ layers: ['mm-neigh-selected'] })[0]?.properties
              ?.territory_id ?? '',
          );
          const pts = map.getLayer('mm-act-points')
            ? map.queryRenderedFeatures({ layers: ['mm-act-points'] })
            : [];
          el.dataset.activityPoints = JSON.stringify(
            pts.slice(0, 20).flatMap((f) => {
              if (f.geometry.type !== 'Point') return [];
              const pt = map!.project(f.geometry.coordinates as [number, number]);
              return [
                { id: String(f.properties?.id ?? ''), x: Math.round(pt.x), y: Math.round(pt.y) },
              ];
            }),
          );
        });
        for (const id of [...ACTIVITY_LAYER_IDS, ...POI_LAYER_IDS]) {
          map.on('mouseenter', id, () => (map!.getCanvas().style.cursor = 'pointer'));
          map.on('mouseleave', id, () => (map!.getCanvas().style.cursor = ''));
        }

        setReady(true);
      });
    })();

    return () => {
      disposed = true;
      ctrl.abort();
      map?.remove();
      mapRef.current = null;
    };
  }, []);

  // ---- municipal geometry (lazy) -------------------------------------------
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    loadMunicipalGeo()
      .then((geo) => {
        if (cancelled) return;
        const boxes = new Map<string, [number, number, number, number]>();
        for (const f of geo.features) boxes.set(String(f.properties.codarea), bboxOf(f.geometry));
        bboxesRef.current = boxes;
        setMuniBoxes(boxes);
        geoRef.current = geo;
        // Data (with values) is set by the choropleth effect once geoState = 'ok'.
        setGeoState('ok');
      })
      .catch(() => {
        if (!cancelled) setGeoState('failed');
      });
    return () => {
      cancelled = true;
    };
  }, [ready]);

  // ---- choropleth: polygons (or centroid circles when the mesh fails) -------
  // Values travel as GeoJSON properties; MapLibre buckets them in its worker.
  const { layer, layerValues, index } = props;
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const palette = readMapPalette();
    const valueOf = (code: string): number | undefined => {
      if (LAYERS[layer].scale === 'none') return undefined;
      const v = layerValues?.values[`mg-${code}`];
      return v === null || v === undefined ? undefined : v;
    };
    const geo = geoRef.current;
    if (geoState === 'ok' && geo) {
      map.getSource<GeoJSONSource>(SRC_MUNI)?.setData({
        type: 'FeatureCollection',
        features: geo.features.map((f) => {
          const code = String(f.properties.codarea);
          const v = valueOf(code);
          const name = index.byId.get(`mg-${code}`)?.name;
          return {
            ...f,
            properties: {
              ...f.properties,
              ...(name ? { name } : {}),
              ...(v === undefined ? {} : { v }),
            },
          };
        }),
      });
    }
    if (geoState === 'failed') {
      const features: GeoFeature<GeoPoint>[] = index.municipalities
        .filter((m) => m.centroid && m.ibge_code)
        .map((m) => {
          const v = valueOf(m.ibge_code!);
          return {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: m.centroid as [number, number] },
            properties: v === undefined ? { codarea: m.ibge_code } : { codarea: m.ibge_code, v },
          };
        });
      map.getSource<GeoJSONSource>(SRC_MUNI_PTS)?.setData({ type: 'FeatureCollection', features });
    }
    map.setLayoutProperty(
      'mm-muni-circles',
      'visibility',
      geoState === 'failed' ? 'visible' : 'none',
    );
    const expr = fillExpression(palette, layer, layerValues);
    map.setPaintProperty('mm-muni-fill', 'fill-color', expr);
    map.setPaintProperty(
      'mm-muni-fill',
      'fill-opacity',
      LAYERS[layer].scale === 'none' ? 0.35 : 0.8,
    );
    map.setPaintProperty('mm-muni-circles', 'circle-color', expr);
  }, [ready, geoState, layer, layerValues, index]);

  // ---- overlays: visibility is independent of the statistical layer --------------
  const showActivities = props.showActivities ?? true;
  const showPois = props.showPois ?? false;
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    for (const id of ACTIVITY_LAYER_IDS) {
      if (map.getLayer(id))
        map.setLayoutProperty(id, 'visibility', overlayVisibility(showActivities));
    }
    for (const id of POI_LAYER_IDS) {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', overlayVisibility(showPois));
    }
  }, [ready, showActivities, showPois]);

  // ---- points of interest ----------------------------------------------------------
  const { pois } = props;
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const features: GeoFeature<GeoPoint>[] = (pois ?? []).map((p) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: p.coordinates },
      properties: { id: p.id },
    }));
    map.getSource<GeoJSONSource>(SRC_POI)?.setData({ type: 'FeatureCollection', features });
  }, [ready, pois]);

  // ---- neighborhood areas (lazy, cached; D29 + FE-10 automatic by zoom) -------------
  // Selected municipality at any zoom; from zoom ≥ AUTO_AREAS_MIN_ZOOM every municipality
  // whose polygon bbox intersects the viewport (≤ AUTO_AREAS_LIMIT, nearest first).
  const { selectedId, neighborhoodValues } = props;
  const selectedMuniId = selectedId ? municipalityIdOf(selectedId) : null;
  const areaIds = useMemo(
    () =>
      ready && geoState !== 'loading'
        ? visibleMunicipalities(
            muniBoxes,
            view?.box ?? [0, 0, 0, 0],
            view?.zoom ?? 0,
            selectedMuniId,
          )
        : [],
    [ready, geoState, muniBoxes, view, selectedMuniId],
  );
  const areaKey = areaIds.join(',');
  const [areasById, setAreasById] = useState<ReadonlyMap<string, NeighborhoodAreas>>(
    () => new Map(),
  );
  const controllersRef = useRef(new Map<string, AbortController>());
  useEffect(() => {
    const ids = areaKey ? areaKey.split(',') : [];
    const wanted = new Set(ids);
    // Abort fetches of municipalities that left the viewport.
    for (const [id, c] of controllersRef.current) {
      if (!wanted.has(id)) {
        c.abort();
        controllersRef.current.delete(id);
      }
    }
    for (const id of ids) {
      if (controllersRef.current.has(id)) continue;
      const ctrl = new AbortController();
      controllersRef.current.set(id, ctrl);
      void loadNeighborhoodAreas(id, undefined, ctrl.signal).then((a) => {
        if (ctrl.signal.aborted || controllersRef.current.get(id) !== ctrl) return;
        if (a) setAreasById((prev) => new Map(prev).set(id, a));
      });
    }
  }, [areaKey]);
  useEffect(() => {
    const controllers = controllersRef.current;
    return () => {
      for (const c of controllers.values()) c.abort();
      controllers.clear();
    };
  }, []);
  const onAreaMunisRef = useRef(props.onAreaMunicipalitiesChange);
  useEffect(() => {
    onAreaMunisRef.current = props.onAreaMunicipalitiesChange;
  });
  useEffect(() => {
    onAreaMunisRef.current?.(areaKey ? areaKey.split(',') : []);
  }, [areaKey]);
  const activeAreas = selectedMuniId ? (areasById.get(selectedMuniId) ?? null) : null;
  const shownAreas = useMemo(
    () => areaIds.flatMap((id) => areasById.get(id) ?? []),
    [areaIds, areasById],
  );

  // ---- selection: outline + neighborhood areas/points ------------------------------
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const palette = readMapPalette();
    const muniId = selectedId ? municipalityIdOf(selectedId) : null;
    const muni = muniId && muniId !== 'mg' ? index.byId.get(muniId) : undefined;
    map.setFilter('mm-muni-selected', ['==', ['get', 'codarea'], muni?.ibge_code ?? '']);
    map.setFilter('mm-muni-selected-casing', ['==', ['get', 'codarea'], muni?.ibge_code ?? '']);
    const children = muni ? (index.childrenOf.get(muni.id) ?? []) : [];
    const withArea = new Set(shownAreas.flatMap((a) => [...a.bboxes.keys()]));
    map.getSource<GeoJSONSource>(SRC_NEIGH_AREA)?.setData({
      type: 'FeatureCollection',
      features: shownAreas
        .flatMap((a) => a.features)
        .map((f) => {
          const v = neighborhoodValues?.[f.properties.territory_id];
          return {
            type: 'Feature',
            geometry: f.geometry,
            properties: {
              territory_id: f.properties.territory_id,
              name: f.properties.name,
              ...(v !== undefined ? { v } : {}),
            },
          };
        }) as GeoFeature[],
    });
    const selectedArea = selectedId && withArea.has(selectedId) ? selectedId : '';
    map.setFilter('mm-neigh-selected', ['==', ['get', 'territory_id'], selectedArea]);
    map.setFilter('mm-neigh-selected-casing', ['==', ['get', 'territory_id'], selectedArea]);
    map.setPaintProperty(
      'mm-neigh-fill',
      'fill-color',
      neighborhoodColor(palette, layer, layerValues),
    );
    // Points only where there is no area (fallback).
    const features: GeoFeature<GeoPoint>[] = children
      .filter((c) => c.centroid && !withArea.has(c.id))
      .map((c) => {
        const v = neighborhoodValues?.[c.id];
        return {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: c.centroid as [number, number] },
          properties: {
            id: c.id,
            selected: c.id === selectedId,
            ...(v !== undefined ? { v } : {}),
          },
        };
      });
    map.getSource<GeoJSONSource>(SRC_NEIGH)?.setData({ type: 'FeatureCollection', features });
    map.setPaintProperty(
      'mm-neigh',
      'circle-color',
      neighborhoodColor(palette, layer, layerValues),
    );
  }, [ready, selectedId, neighborhoodValues, index, layer, layerValues, shownAreas]);

  // ---- activities ---------------------------------------------------------------
  const { activities } = props;
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const features: GeoFeature<GeoPoint>[] = activities
      .filter((a) => a.coordinates && a.status === 'published')
      .map((a) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: a.coordinates as [number, number] },
        properties: { id: a.id },
      }));
    map.getSource<GeoJSONSource>(SRC_ACT)?.setData({ type: 'FeatureCollection', features });
  }, [ready, activities]);

  // ---- camera (selection & deep links) -----------------------------------------
  const { padding } = props;
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    // Wait for the mesh before framing a municipality so deep links frame correctly.
    if (geoState === 'loading' && selectedId && municipalityIdOf(selectedId) !== 'mg') return;
    const selectedEntry = selectedId ? index.byId.get(selectedId) : undefined;
    // Re-frame a municipality once its polygon bbox becomes available (deep links).
    // Padding is part of the key: the mobile sheet overlap is measured after it opens and
    // the territory is re-framed in the visible part of the map.
    const areaBox =
      selectedEntry?.type === 'neighborhood'
        ? activeAreas?.bboxes.get(selectedEntry.id)
        : undefined;
    const key = `${selectedId ?? ''}|${selectedEntry?.type === 'municipality' ? geoState : ''}|${areaBox ? 'area' : ''}|${padding.top ?? 72}|${padding.bottom}`;
    if (lastCameraRef.current === key) return;
    const firstMove = lastCameraRef.current === undefined;
    lastCameraRef.current = key;

    const duration =
      firstMove || prefersReducedMotion()
        ? 0
        : Math.min(650, Math.max(350, cssDurationMs('--duration-map', 500)));
    const pad = {
      top: padding.top ?? 72,
      left: 24,
      right: 24 + padding.right,
      bottom: 24 + padding.bottom,
    };
    const entry = selectedEntry;
    const move = (fn: () => void) => {
      try {
        fn();
      } catch {
        // padding larger than viewport, etc. — ignore camera move
      }
    };
    if (!entry || entry.type === 'state') {
      move(() => map.fitBounds(MG_BOUNDS, { padding: pad, duration }));
      return;
    }
    if (entry.type === 'neighborhood' && areaBox) {
      // Deep links / search: frame the approximate area of the neighborhood.
      const b = new LngLatBounds([areaBox[0], areaBox[1]], [areaBox[2], areaBox[3]]);
      move(() => map.fitBounds(b, { padding: pad, duration, maxZoom: 14 }));
      return;
    }
    if (entry.type === 'neighborhood' && entry.centroid) {
      const center = entry.centroid;
      move(() =>
        duration === 0
          ? map.jumpTo({ center, zoom: 13, padding: pad })
          : map.flyTo({ center, zoom: 13, padding: pad, duration, essential: false }),
      );
      return;
    }
    const box = entry.ibge_code ? bboxesRef.current.get(entry.ibge_code) : undefined;
    if (box) {
      const b = new LngLatBounds([box[0], box[1]], [box[2], box[3]]);
      move(() => map.fitBounds(b, { padding: pad, duration, maxZoom: 11 }));
    } else if (entry.centroid) {
      const center = entry.centroid;
      move(() =>
        duration === 0
          ? map.jumpTo({ center, zoom: 9, padding: pad })
          : map.flyTo({ center, zoom: 9, padding: pad, duration, essential: false }),
      );
    }
  }, [ready, geoState, selectedId, index, activeAreas, padding.top, padding.right, padding.bottom]);

  return (
    <div className="absolute inset-0">
      {/* Inline style: maplibre-gl.css forces .maplibregl-map { position: relative }. */}
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />
      {hover ? (
        <div
          className="pointer-events-none absolute z-10 max-w-60 rounded-sm border border-border bg-surface-raised px-2 py-1 text-sm text-primary shadow-raised"
          style={{ left: hover.x + 12, top: hover.y + 12 }}
          aria-hidden="true"
        >
          <p className="font-semibold">{hover.title}</p>
          {hover.value ? <p className="text-secondary">{hover.value}</p> : null}
        </div>
      ) : null}
      {geoState === 'failed' ? (
        <p className="absolute top-2 left-1/2 z-10 -translate-x-1/2 rounded-sm bg-warning-soft px-2 py-1 text-xs text-primary shadow-raised">
          Contornos municipais indisponíveis — exibindo municípios como pontos.
        </p>
      ) : null}
    </div>
  );
}
