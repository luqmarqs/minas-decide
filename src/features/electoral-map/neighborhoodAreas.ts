/**
 * Approximate neighborhood areas (owner decision D29): Voronoi cells of the polling places,
 * clipped by the IBGE municipal polygon and merged by neighborhood, generated offline into
 * `public/geo/bairros/<ibge7>.geojson`. They are NOT official boundaries. Loaded for the
 * selected municipality and, from zoom ≥ AUTO_AREAS_MIN_ZOOM, automatically for the
 * municipalities on screen (at most AUTO_AREAS_LIMIT at a time; never at state level),
 * cached in memory per municipality; fetches of municipalities that leave the viewport
 * are aborted. Missing/invalid file → `null` and the map keeps the points (fallback).
 */
export const NEIGHBORHOOD_AREAS_BASE = '/geo/bairros';
export const NEIGHBORHOOD_AREAS_NOTE =
  'Áreas aproximadas pelos locais de votação (Voronoi), não são limites oficiais.';

type Position = [number, number];
export interface AreaGeometry {
  type: 'Polygon' | 'MultiPolygon';
  coordinates: Position[][] | Position[][][];
}
export interface AreaFeature {
  type: 'Feature';
  geometry: AreaGeometry;
  properties: { territory_id: string; name: string; [k: string]: unknown };
}
export interface NeighborhoodAreas {
  municipalityId: string;
  features: AreaFeature[];
  /** territory_id → [minX, minY, maxX, maxY] */
  bboxes: Map<string, [number, number, number, number]>;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** From this zoom on, areas of every municipality on screen load automatically. */
export const AUTO_AREAS_MIN_ZOOM = 10;
/** Upper bound of municipalities with areas at once (network + GPU). */
export const AUTO_AREAS_LIMIT = 12;

export type BBox = [number, number, number, number];

/**
 * Municipalities whose polygon bbox intersects the viewport (`[w, s, e, n]`), nearest to
 * the viewport centre first, at most `limit`. Below `minZoom` only the selected one. The
 * selected municipality always comes first (its areas stay visible at any zoom).
 * Ids are `mg-<ibge7>`; `boxes` is keyed by the IBGE code.
 */
export function visibleMunicipalities(
  boxes: ReadonlyMap<string, BBox>,
  view: BBox,
  zoom: number,
  selectedMunicipalityId: string | null = null,
  { minZoom = AUTO_AREAS_MIN_ZOOM, limit = AUTO_AREAS_LIMIT } = {},
): string[] {
  const out: string[] = [];
  const selected =
    selectedMunicipalityId && /^mg-\d{7}$/.test(selectedMunicipalityId)
      ? selectedMunicipalityId
      : null;
  if (selected) out.push(selected);
  if (zoom < minZoom) return out;
  const [w, s, e, n] = view;
  const cx = (w + e) / 2;
  const cy = (s + n) / 2;
  const hits: { id: string; d: number }[] = [];
  for (const [code, b] of boxes) {
    if (b[2] < w || b[0] > e || b[3] < s || b[1] > n) continue;
    const id = `mg-${code}`;
    if (id === selected) continue;
    const dx = (b[0] + b[2]) / 2 - cx;
    const dy = (b[1] + b[3]) / 2 - cy;
    hits.push({ id, d: dx * dx + dy * dy });
  }
  hits.sort((a, b) => a.d - b.d || a.id.localeCompare(b.id));
  for (const h of hits) {
    if (out.length >= limit) break;
    out.push(h.id);
  }
  return out;
}

const cache = new Map<string, Promise<NeighborhoodAreas | null>>();

/** Test helper. */
export function clearNeighborhoodAreasCache(): void {
  cache.clear();
}

function rings(g: AreaGeometry): Position[][] {
  return g.type === 'Polygon'
    ? (g.coordinates as Position[][])
    : (g.coordinates as Position[][][]).flat();
}

export function bboxOfArea(g: AreaGeometry): [number, number, number, number] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const ring of rings(g)) {
    for (const [x, y] of ring) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  return [minX, minY, maxX, maxY];
}

function isAreaFeature(f: unknown, municipalityId: string): f is AreaFeature {
  if (!f || typeof f !== 'object') return false;
  const feat = f as Partial<AreaFeature>;
  const id = feat.properties?.territory_id;
  const type = feat.geometry?.type;
  return (
    typeof id === 'string' &&
    id.startsWith(`${municipalityId}-`) &&
    (type === 'Polygon' || type === 'MultiPolygon') &&
    Array.isArray(feat.geometry?.coordinates)
  );
}

/** `mg-3140001` → areas of its neighborhoods, or null (no file / invalid → points fallback). */
export function loadNeighborhoodAreas(
  municipalityId: string,
  fetchImpl: FetchLike = (i, init) => fetch(i, init),
  signal?: AbortSignal,
): Promise<NeighborhoodAreas | null> {
  const m = /^mg-(\d{7})$/.exec(municipalityId);
  if (!m) return Promise.resolve(null);
  let p = cache.get(municipalityId);
  if (!p) {
    p = (async () => {
      let res: Response;
      try {
        res = await fetchImpl(`${NEIGHBORHOOD_AREAS_BASE}/${m[1]}.geojson`, {
          headers: { Accept: 'application/geo+json, application/json' },
          signal,
        });
      } catch {
        cache.delete(municipalityId); // network/aborted: allow a retry later
        return null;
      }
      const type = res.headers.get('content-type') ?? '';
      if (!res.ok || type.includes('text/html')) return null;
      let json: unknown;
      try {
        json = await res.json();
      } catch {
        if (signal?.aborted) cache.delete(municipalityId);
        return null;
      }
      const fc = json as { type?: string; features?: unknown[] };
      if (fc?.type !== 'FeatureCollection' || !Array.isArray(fc.features)) return null;
      const features = fc.features.filter((f): f is AreaFeature =>
        isAreaFeature(f, municipalityId),
      );
      if (!features.length) return null;
      const bboxes = new Map(
        features.map((f) => [f.properties.territory_id, bboxOfArea(f.geometry)] as const),
      );
      return { municipalityId, features, bboxes };
    })();
    cache.set(municipalityId, p);
  }
  return p;
}
