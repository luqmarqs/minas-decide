/**
 * Static SVG geometry of Minas Gerais municipalities for the narrative section (no
 * MapLibre): the IBGE mesh (`public/geo/mg-municipios.geojson`) projected with a simple
 * equirectangular projection (longitude scaled by cos(mean latitude)), simplified by
 * dropping points closer than ~0.6 px. One path per municipality, keyed `mg-<ibge7>`.
 */
type Position = [number, number];
interface Polygon {
  type: 'Polygon';
  coordinates: Position[][];
}
interface MultiPolygon {
  type: 'MultiPolygon';
  coordinates: Position[][][];
}
export interface MunicipalFeature {
  type: 'Feature';
  geometry: Polygon | MultiPolygon;
  properties: { codarea: string | number };
}
export interface MunicipalCollection {
  type: 'FeatureCollection';
  features: MunicipalFeature[];
}

export interface ProjectedMap {
  width: number;
  height: number;
  paths: { id: string; d: string }[];
}

export const GEO_URL = '/geo/mg-municipios.geojson';

let geoPromise: Promise<MunicipalCollection> | null = null;
export function loadMunicipalGeo(fetchImpl: typeof fetch = fetch): Promise<MunicipalCollection> {
  geoPromise ??= fetchImpl(GEO_URL, {
    headers: { Accept: 'application/geo+json, application/json' },
  }).then(async (r) => {
    const type = r.headers.get('content-type') ?? '';
    if (!r.ok || type.includes('text/html')) throw new Error(`geo ${r.status}`);
    const json = (await r.json()) as MunicipalCollection;
    if (json?.type !== 'FeatureCollection' || !Array.isArray(json.features))
      throw new Error('geo invalid');
    return json;
  });
  geoPromise.catch(() => {
    geoPromise = null;
  });
  return geoPromise;
}

function ringsOf(g: Polygon | MultiPolygon): Position[][] {
  return g.type === 'Polygon' ? g.coordinates : g.coordinates.flat();
}

/** Equirectangular projection of the whole collection into a `width`-wide viewBox. */
export function projectMunicipalities(geo: MunicipalCollection, width = 560): ProjectedMap {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const f of geo.features) {
    for (const ring of ringsOf(f.geometry)) {
      for (const [x, y] of ring) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (!Number.isFinite(minX)) return { width, height: 0, paths: [] };
  const k = Math.cos((((minY + maxY) / 2) * Math.PI) / 180);
  const scale = width / ((maxX - minX) * k);
  const height = Math.ceil((maxY - minY) * scale);
  const px = (x: number) => (x - minX) * k * scale;
  const py = (y: number) => (maxY - y) * scale;
  const r1 = (n: number) => Math.round(n * 10) / 10;
  const paths = geo.features.map((f) => {
    let d = '';
    for (const ring of ringsOf(f.geometry)) {
      let lastX = NaN;
      let lastY = NaN;
      let seg = '';
      let n = 0;
      ring.forEach(([x, y], i) => {
        const X = px(x);
        const Y = py(y);
        const last = i === ring.length - 1;
        if (i > 0 && !last && Math.abs(X - lastX) < 0.6 && Math.abs(Y - lastY) < 0.6) return;
        seg += `${n === 0 ? 'M' : 'L'}${r1(X)} ${r1(Y)}`;
        lastX = X;
        lastY = Y;
        n += 1;
      });
      if (n >= 3) d += `${seg}Z`;
    }
    return { id: `mg-${String(f.properties.codarea)}`, d };
  });
  return { width, height, paths };
}
