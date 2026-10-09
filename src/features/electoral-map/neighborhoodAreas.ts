/**
 * Approximate neighborhood areas (owner decision D29): Voronoi cells of the polling places,
 * clipped by the IBGE municipal polygon and merged by neighborhood, generated offline into
 * `public/geo/bairros/<ibge7>.geojson`. They are NOT official boundaries. Loaded only when a
 * municipality is selected (never at state level), cached in memory per municipality.
 * Missing/invalid file → `null` and the map keeps the neighborhood points (fallback).
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
        });
      } catch {
        cache.delete(municipalityId); // network: allow a retry later
        return null;
      }
      const type = res.headers.get('content-type') ?? '';
      if (!res.ok || type.includes('text/html')) return null;
      let json: unknown;
      try {
        json = await res.json();
      } catch {
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
