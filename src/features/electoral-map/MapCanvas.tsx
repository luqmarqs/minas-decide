/**
 * MapLibre canvas. Loaded ONLY through React.lazy from MapShell, so maplibre-gl
 * (and its CSS) live in a separate chunk. Rendering rules:
 * - municipalities: IBGE polygons (lazy fetched GeoJSON) coloured through
 *   feature-state (no React state per feature); centroid circles if the mesh fails;
 * - neighborhoods: points (no invented polygons) for the selected municipality;
 * - activities: clustered GeoJSON source (WebGL, no DOM markers);
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
  type ExpressionSpecification,
  type GeoJSONSource,
  type MapLayerMouseEvent,
  type StyleSpecification,
} from 'maplibre-gl';
import { useEffect, useRef, useState } from 'react';
import type { PublicActivity } from '@shared/contracts/activities.ts';
import type { MapLayerCode, MapLayerValues } from '@shared/contracts/metrics.ts';
import { municipalityIdOf } from '@shared/contracts/snapshot.ts';
import { cssDurationMs, prefersReducedMotion } from '@/lib/media';
import type { TerritoryIndex } from './hooks';
import { formatLayerValue, LAYERS } from './layers';
import { readMapPalette, safeDomain, type MapPalette } from './palette';

setWorkerUrl(maplibreWorkerUrl);

const BASEMAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';
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
const SRC_ACT = 'mm-activities';

export type BasemapProblem = 'style' | 'tiles';

export interface MapCanvasProps {
  index: TerritoryIndex;
  selectedId: string | null;
  layer: MapLayerCode;
  layerValues: MapLayerValues | null | undefined;
  /** Values for neighborhoods of the selected municipality (territory_id → value). */
  neighborhoodValues: Record<string, number> | null;
  activities: PublicActivity[];
  onSelect: (id: string | null) => void;
  onActivitySelect: (id: string) => void;
  onFatalError: () => void;
  onBasemapProblem: (p: BasemapProblem) => void;
  /** Extra right padding (desktop side panel) and bottom padding (mobile sheet). */
  padding: { right: number; bottom: number };
  ariaLabel?: string;
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

async function loadBaseStyle(signal: AbortSignal): Promise<StyleSpecification> {
  const timeout = AbortSignal.timeout(8000);
  const res = await fetch(BASEMAP_STYLE_URL, { signal: AbortSignal.any([signal, timeout]) });
  if (!res.ok) throw new Error(`style ${res.status}`);
  return (await res.json()) as StyleSpecification;
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

function fillExpression(
  p: MapPalette,
  layer: MapLayerCode,
  values: MapLayerValues | null | undefined,
): ExpressionSpecification | string {
  if (layer === 'activities' || !values) return p.none;
  const meta = LAYERS[layer];
  const diverging = meta.scale === 'diverging';
  const [a, b] = safeDomain(values.domain, diverging);
  const v: ExpressionSpecification = ['to-number', ['feature-state', 'v'], 0];
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
  return ['case', ['boolean', ['feature-state', 'has'], false], ramp, p.none];
}

function neighborhoodColor(
  p: MapPalette,
  layer: MapLayerCode,
  values: MapLayerValues | null | undefined,
): ExpressionSpecification | string {
  if (layer === 'activities' || !values) return p.none;
  const diverging = LAYERS[layer].scale === 'diverging';
  const [a, b] = safeDomain(values.domain, diverging);
  const v: ExpressionSpecification = ['to-number', ['get', 'v'], 0];
  const ramp: ExpressionSpecification = diverging
    ? ['interpolate', ['linear'], v, a, p.diverging[0], 0, p.diverging[1], b, p.diverging[2]]
    : [
        'interpolate',
        ['linear'],
        v,
        a,
        p.sequential[0],
        (a + b) / 2,
        p.sequential[2],
        b,
        p.sequential[4],
      ];
  return ['case', ['has', 'v'], ramp, p.none];
}

export default function MapCanvas(props: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const propsRef = useRef(props);
  const bboxesRef = useRef<Map<string, [number, number, number, number]>>(new Map());
  const hoverRef = useRef<{ source: string; id: string | number } | null>(null);
  const lastCameraRef = useRef<string | null | undefined>(undefined);
  const [ready, setReady] = useState(false);
  const [geoState, setGeoState] = useState<'loading' | 'ok' | 'failed'>('loading');
  const [hover, setHover] = useState<HoverInfo | null>(null);

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
        style = await loadBaseStyle(ctrl.signal);
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
        map.addLayer({
          id: 'mm-act-clusters',
          type: 'circle',
          source: SRC_ACT,
          filter: ['has', 'point_count'],
          layout: { visibility: 'none' },
          paint: {
            'circle-color': palette.activity,
            'circle-opacity': 0.9,
            'circle-radius': ['step', ['get', 'point_count'], 14, 10, 18, 50, 24],
            'circle-stroke-color': palette.surface,
            'circle-stroke-width': 2,
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
        map.addLayer({
          id: 'mm-act-points',
          type: 'circle',
          source: SRC_ACT,
          filter: ['!', ['has', 'point_count']],
          layout: { visibility: 'none' },
          paint: {
            'circle-color': palette.activity,
            'circle-radius': 7,
            'circle-stroke-color': palette.surface,
            'circle-stroke-width': 2,
          },
        });

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
              p.layer === 'activities'
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
          if (p.layer === 'activities') {
            const act = map!.queryRenderedFeatures(e.point, {
              layers: ['mm-act-points', 'mm-act-clusters'],
            });
            if (act.length) return;
          }
          const neigh = map!.queryRenderedFeatures(e.point, { layers: ['mm-neigh'] });
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
              p.layer === 'activities'
                ? ''
                : `${LAYERS[p.layer].short}: ${formatLayerValue(p.layer, v ?? null)}`,
          });
        });
        map.on('mouseleave', 'mm-neigh', muniLeave);
        map.on('click', 'mm-neigh', (e) => {
          const id = e.features?.[0]?.properties?.id as string | undefined;
          if (id) propsRef.current.onSelect(id);
        });

        map.on('click', 'mm-act-clusters', async (e) => {
          const f = e.features?.[0];
          const clusterId = f?.properties?.cluster_id as number | undefined;
          const src = map!.getSource<GeoJSONSource>(SRC_ACT);
          if (clusterId === undefined || !src || f?.geometry.type !== 'Point') return;
          const zoom = await src.getClusterExpansionZoom(clusterId);
          map!.easeTo({
            center: f.geometry.coordinates as [number, number],
            zoom,
            duration: cssDurationMs('--duration-map', 500),
          });
        });
        map.on('click', 'mm-act-points', (e) => {
          const id = e.features?.[0]?.properties?.id as string | undefined;
          if (id) propsRef.current.onActivitySelect(id);
        });
        for (const id of ['mm-act-clusters', 'mm-act-points']) {
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
        const map = mapRef.current;
        const boxes = new Map<string, [number, number, number, number]>();
        for (const f of geo.features) boxes.set(String(f.properties.codarea), bboxOf(f.geometry));
        bboxesRef.current = boxes;
        map?.getSource<GeoJSONSource>(SRC_MUNI)?.setData(geo);
        setGeoState('ok');
      })
      .catch(() => {
        if (!cancelled) setGeoState('failed');
      });
    return () => {
      cancelled = true;
    };
  }, [ready]);

  // Centroid circles: always fed (used for hover/colour when the mesh is missing).
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const features: GeoFeature<GeoPoint>[] = props.index.municipalities
      .filter((m) => m.centroid && m.ibge_code)
      .map((m) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: m.centroid as [number, number] },
        properties: { codarea: m.ibge_code },
      }));
    map.getSource<GeoJSONSource>(SRC_MUNI_PTS)?.setData({ type: 'FeatureCollection', features });
    map.setLayoutProperty(
      'mm-muni-circles',
      'visibility',
      geoState === 'failed' ? 'visible' : 'none',
    );
  }, [ready, geoState, props.index]);

  // ---- choropleth values (feature-state) ------------------------------------
  const { layer, layerValues, index } = props;
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const palette = readMapPalette();
    for (const source of [SRC_MUNI, SRC_MUNI_PTS]) map.removeFeatureState({ source });
    for (const m of index.municipalities) {
      if (!m.ibge_code) continue;
      const v = layer === 'activities' ? undefined : layerValues?.values[m.id];
      const state = { has: v !== undefined && v !== null, v: v ?? 0, known: true };
      map.setFeatureState({ source: SRC_MUNI, id: m.ibge_code }, state);
      map.setFeatureState({ source: SRC_MUNI_PTS, id: m.ibge_code }, state);
    }
    const expr = fillExpression(palette, layer, layerValues);
    map.setPaintProperty('mm-muni-fill', 'fill-color', expr);
    map.setPaintProperty('mm-muni-fill', 'fill-opacity', layer === 'activities' ? 0.35 : 0.8);
    map.setPaintProperty('mm-muni-circles', 'circle-color', expr);
    const actVis = layer === 'activities' ? 'visible' : 'none';
    for (const id of ['mm-act-clusters', 'mm-act-count', 'mm-act-points']) {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', actVis);
    }
  }, [ready, geoState, layer, layerValues, index]);

  // ---- selection: outline + neighborhood points ------------------------------
  const { selectedId, neighborhoodValues } = props;
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const palette = readMapPalette();
    const muniId = selectedId ? municipalityIdOf(selectedId) : null;
    const muni = muniId && muniId !== 'mg' ? index.byId.get(muniId) : undefined;
    map.setFilter('mm-muni-selected', ['==', ['get', 'codarea'], muni?.ibge_code ?? '']);
    const children = muni ? (index.childrenOf.get(muni.id) ?? []) : [];
    const features: GeoFeature<GeoPoint>[] = children
      .filter((c) => c.centroid)
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
  }, [ready, selectedId, neighborhoodValues, index, layer, layerValues]);

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
    const key = `${selectedId ?? ''}|${selectedEntry?.type === 'municipality' ? geoState : ''}`;
    if (lastCameraRef.current === key) return;
    const firstMove = lastCameraRef.current === undefined;
    lastCameraRef.current = key;

    const duration =
      firstMove || prefersReducedMotion()
        ? 0
        : Math.min(650, Math.max(350, cssDurationMs('--duration-map', 500)));
    const pad = { top: 72, left: 24, right: 24 + padding.right, bottom: 24 + padding.bottom };
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
  }, [ready, geoState, selectedId, index, padding.right, padding.bottom]);

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
