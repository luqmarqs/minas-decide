/** Pure geometry helpers for the POI pipeline (ray casting, dedupe). No I/O. */

export type Ring = [number, number][];
export type Polygonal =
  { type: 'Polygon'; coordinates: Ring[] } | { type: 'MultiPolygon'; coordinates: Ring[][] };

export interface RawPoi {
  id: string;
  name: string;
  category: 'bus_terminal' | 'bus_station' | 'metro_station';
  /** [lon, lat] */
  coordinates: [number, number];
  osm_type: string;
  osm_id: number;
}

/** Even-odd ray casting for one ring ([lon, lat] pairs). */
export function inRing(pt: [number, number], ring: Ring): boolean {
  const [x, y] = pt;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Polygon with holes: inside the outer ring and outside every hole. */
export function inPolygon(pt: [number, number], g: Polygonal): boolean {
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  return polys.some(
    (rings) =>
      rings.length > 0 && inRing(pt, rings[0]!) && !rings.slice(1).some((h) => inRing(pt, h)),
  );
}

export function assignMunicipality(
  pt: [number, number],
  features: { properties: { codarea: string }; geometry: Polygonal }[],
  centroids: { id: string; lon: number; lat: number }[],
): { id: string | null; method: 'polygon' | 'nearest' | 'none' } {
  for (const f of features)
    if (inPolygon(pt, f.geometry)) return { id: `mg-${f.properties.codarea}`, method: 'polygon' };
  let best: { id: string; d: number } | null = null;
  for (const c of centroids) {
    const d = (c.lon - pt[0]) ** 2 + (c.lat - pt[1]) ** 2;
    if (!best || d < best.d) best = { id: c.id, d };
  }
  return best ? { id: best.id, method: 'nearest' } : { id: null, method: 'none' };
}

const PRIORITY: Record<RawPoi['category'], number> = {
  bus_terminal: 0,
  metro_station: 1,
  bus_station: 2,
};

/** Dedupe family: bus terminals and bus/BRT stations are often the same place mapped twice; metro stays apart. */
const family = (c: RawPoi['category']) => (c === 'metro_station' ? 'metro' : 'bus');

/** Keeps one item per cluster of same-family points closer than `maxM` metres (terminal > bus station; node first). */
export function dedupe(
  items: RawPoi[],
  maxM: number,
  dist: (lat1: number, lon1: number, lat2: number, lon2: number) => number,
): { kept: RawPoi[]; dropped: number } {
  const order = [...items].sort(
    (a, b) =>
      PRIORITY[a.category] - PRIORITY[b.category] ||
      (a.osm_type === 'node' ? 0 : 1) - (b.osm_type === 'node' ? 0 : 1) ||
      a.osm_id - b.osm_id,
  );
  const kept: RawPoi[] = [];
  for (const p of order) {
    const dup = kept.some(
      (k) =>
        family(k.category) === family(p.category) &&
        dist(k.coordinates[1], k.coordinates[0], p.coordinates[1], p.coordinates[0]) < maxM,
    );
    if (!dup) kept.push(p);
  }
  return { kept, dropped: items.length - kept.length };
}
