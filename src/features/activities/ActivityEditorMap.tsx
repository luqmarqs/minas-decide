/**
 * Point picker for the activity editor. Loaded with React.lazy (maplibre chunk); click/tap on
 * the map or dragging the pin proposes a point, which the person must still confirm in the form
 * (`location_confirmed`). The manual latitude/longitude fields remain the keyboard alternative.
 */
import 'maplibre-gl/dist/maplibre-gl.css';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { Map as MapLibreMap, Marker, NavigationControl, setWorkerUrl } from 'maplibre-gl';
import { useEffect, useRef, useState } from 'react';
import { MAP_ATTRIBUTION } from '@/features/electoral-map/MapShell';
import { cssDurationMs, cssVar, prefersReducedMotion } from '@/lib/media';

setWorkerUrl(maplibreWorkerUrl);

const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';
const MG_CENTER: [number, number] = [-44.5, -18.5];
const PIN_ZOOM = 16;
const CITY_ZOOM = 13;

export interface ActivityEditorMapProps {
  /** Territory centroid: the map centers here when the territory changes (never the point). */
  center: [number, number] | null;
  value: [number, number] | null;
  /** Bumped when a search result/link sets the point: the map flies to the pin (zoom 16). */
  focusKey: number;
  onPick: (lonLat: [number, number]) => void;
}

export default function ActivityEditorMap({
  center,
  value,
  focusKey,
  onPick,
}: ActivityEditorMapProps) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const marker = useRef<Marker | null>(null);
  const onPickRef = useRef(onPick);
  const valueRef = useRef(value);
  const lastCenter = useRef(center);
  const lastFocus = useRef(focusKey);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    onPickRef.current = onPick;
    valueRef.current = value;
  }, [onPick, value]);

  useEffect(() => {
    if (!el.current) return;
    let m: MapLibreMap;
    try {
      m = new MapLibreMap({
        container: el.current,
        style: STYLE_URL,
        center: value ?? center ?? MG_CENTER,
        zoom: value ? PIN_ZOOM : center ? CITY_ZOOM : 6,
        attributionControl: false,
        cooperativeGestures: true,
      });
    } catch {
      // Reported asynchronously (WebGL unavailable, context lost…).
      queueMicrotask(() =>
        setProblem(
          'O mapa não pôde ser aberto neste navegador. Use os campos de latitude e longitude.',
        ),
      );
      return;
    }
    map.current = m;
    m.addControl(new NavigationControl({ showCompass: false }), 'bottom-right');
    m.on('error', () =>
      setProblem('Parte do mapa de fundo não carregou. O clique continua marcando o ponto.'),
    );
    m.on('click', (e) => onPickRef.current([round6(e.lngLat.lng), round6(e.lngLat.lat)]));
    return () => {
      marker.current?.remove();
      marker.current = null;
      m.remove();
      map.current = null;
    };
    // Map is created once; later center/value changes are applied below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (!value) {
      marker.current?.remove();
      marker.current = null;
      return;
    }
    if (!marker.current) {
      const mk = new Marker({ color: cssVar('--map-selected', 'currentColor'), draggable: true })
        .setLngLat(value)
        .addTo(m);
      mk.on('dragend', () => {
        const p = mk.getLngLat();
        onPickRef.current([round6(p.lng), round6(p.lat)]);
      });
      marker.current = mk;
    } else marker.current.setLngLat(value);
  }, [value]);

  // City chosen (search or manual): center on it. Skipped for the initial value.
  useEffect(() => {
    const m = map.current;
    const prev = lastCenter.current;
    lastCenter.current = center;
    if (!m || !center) return;
    if (prev && prev[0] === center[0] && prev[1] === center[1]) return;
    const duration = prefersReducedMotion() ? 0 : cssDurationMs('--duration-map', 500);
    m.easeTo({ center, zoom: CITY_ZOOM, duration });
    // only when the territory changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center?.[0], center?.[1]]);

  // Declared last so it wins over the city centering in the same commit.
  useEffect(() => {
    const m = map.current;
    if (focusKey === lastFocus.current) return;
    lastFocus.current = focusKey;
    const v = valueRef.current;
    if (!m || !v) return;
    const duration = prefersReducedMotion() ? 0 : cssDurationMs('--duration-map', 500);
    m.easeTo({ center: v, zoom: PIN_ZOOM, duration });
  }, [focusKey]);

  return (
    <div className="flex flex-col gap-1">
      <div
        ref={el}
        className="h-72 w-full overflow-hidden rounded-md border border-border bg-surface-alt"
        role="application"
        aria-label="Mapa para marcar o ponto da atividade. Clique ou toque no local, ou arraste o pino."
      />
      <p className="text-xs text-muted">{MAP_ATTRIBUTION}</p>
      {problem ? <p className="text-sm text-warning">{problem}</p> : null}
    </div>
  );
}

function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}
