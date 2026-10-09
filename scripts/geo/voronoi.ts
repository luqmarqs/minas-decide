/**
 * Pure geometry for approximate neighbourhood areas (D29): Voronoi cells of polling places,
 * clipped by the municipal polygon and unioned per neighbourhood. No I/O.
 * Coordinates are [lon, lat] (GeoJSON order). Areas are approximations, never official limits.
 */
import { Delaunay } from 'd3-delaunay';
import polygonClipping, { type MultiPolygon, type Polygon, type Ring } from 'polygon-clipping';

export type { MultiPolygon, Polygon, Ring };
export type MunicipalGeometry =
  { type: 'Polygon'; coordinates: Ring[] } | { type: 'MultiPolygon'; coordinates: Ring[][] };

export interface AreaPoint {
  /** Neighbourhood key (territory id or slug); cells with the same key are unioned. */
  key: string;
  lon: number;
  lat: number;
}

export interface AreaResult {
  /** key → MultiPolygon (only keys with a non-empty area). */
  areas: Map<string, MultiPolygon>;
  /** Points moved by the deterministic jitter (coincident coordinates of different keys). */
  jittered: number;
  /** Coincident points of the same key merged into one. */
  merged: number;
  /** Clipper robustness fallbacks used (see robustUnion). */
  fallbacks: number;
  /** Times the spread radius had to be widened because the Voronoi cells did not tile the bounds. */
  respread: number;
}

export const toMulti = (g: MunicipalGeometry): MultiPolygon =>
  g.type === 'Polygon' ? [g.coordinates] : g.coordinates;

export function bbox(mp: MultiPolygon): [number, number, number, number] {
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (const poly of mp)
    for (const ring of poly)
      for (const [x, y] of ring) {
        if (x < x0) x0 = x;
        if (y < y0) y0 = y;
        if (x > x1) x1 = x;
        if (y > y1) y1 = y;
      }
  return [x0, y0, x1, y1];
}

/** Points closer than this (degrees, Chebyshev; ≈ 1.1 m) are treated as the same location. */
export const NEAR = 1e-5;
/** Spread radii tried in order (degrees); the first one yielding a consistent Voronoi wins. */
export const SPREAD_RADII = [1e-6, 1e-5, 1e-4, 1e-3] as const;

/**
 * Coincident or near-coincident points (within NEAR): same key → merged; n > 1 different keys →
 * spread on a circle of `radius` around the group anchor, at evenly spaced angles (deterministic).
 * Every point stays on the hull of its cluster, so each key keeps a non-degenerate Voronoi wedge.
 */
export function dedupePoints(
  points: AreaPoint[],
  radius: number = SPREAD_RADII[0],
): { points: AreaPoint[]; jittered: number; merged: number } {
  const groups: { lon: number; lat: number; items: AreaPoint[] }[] = [];
  let merged = 0;
  for (const p of points) {
    const g = groups.find(
      (q) => Math.abs(q.lon - p.lon) <= NEAR && Math.abs(q.lat - p.lat) <= NEAR,
    );
    if (!g) {
      groups.push({ lon: p.lon, lat: p.lat, items: [p] });
      continue;
    }
    if (g.items.some((q) => q.key === p.key)) merged++;
    else g.items.push(p);
  }
  const out: AreaPoint[] = [];
  let jittered = 0;
  for (const g of groups) {
    if (g.items.length === 1) {
      out.push(g.items[0]!);
      continue;
    }
    jittered += g.items.length;
    g.items.forEach((p, k) => {
      const a = (2 * Math.PI * k) / g.items.length;
      out.push({
        key: p.key,
        lon: g.lon + radius * Math.cos(a),
        lat: g.lat + radius * Math.sin(a),
      });
    });
  }
  return { points: out, jittered, merged };
}

/** Rounds to `decimals`, drops consecutive duplicates and degenerate rings/polygons. */
export function roundMulti(mp: MultiPolygon, decimals: number): MultiPolygon {
  const f = 10 ** decimals;
  const r = (v: number) => Math.round(v * f) / f;
  const out: MultiPolygon = [];
  for (const poly of mp) {
    const rings: Ring[] = [];
    for (const [i, ring] of poly.entries()) {
      const pts: Ring = [];
      for (const [x, y] of ring) {
        const p: [number, number] = [r(x), r(y)];
        const last = pts[pts.length - 1];
        if (!last || last[0] !== p[0] || last[1] !== p[1]) pts.push(p);
      }
      const first = pts[0];
      const last = pts[pts.length - 1];
      if (first && last && (first[0] !== last[0] || first[1] !== last[1]))
        pts.push([first[0], first[1]]);
      if (pts.length >= 4 && Math.abs(ringArea(pts)) > 0) rings.push(pts);
      else if (i === 0) break; // degenerate outer ring → drop the whole polygon
    }
    if (rings.length > 0) out.push(rings);
  }
  return out;
}

/** Signed planar area (shoelace) in squared degrees. */
export function ringArea(ring: Ring): number {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++)
    a += (ring[j]![0] - ring[i]![0]) * (ring[j]![1] + ring[i]![1]);
  return a / 2;
}

/**
 * Approximate area in km² (equirectangular projection at the ring's mean latitude). Good to
 * well under 1 % for municipality-sized shapes; used only for consistency checks.
 */
export function multiAreaKm2(mp: MultiPolygon): number {
  const R = 6371.0088;
  let total = 0;
  for (const poly of mp)
    poly.forEach((ring, i) => {
      if (ring.length === 0) return;
      const lat0 = (ring.reduce((s, p) => s + p[1], 0) / ring.length) * (Math.PI / 180);
      const kx = (Math.PI / 180) * R * Math.cos(lat0);
      const ky = (Math.PI / 180) * R;
      const a = Math.abs(ringArea(ring)) * kx * ky;
      total += i === 0 ? a : -a;
    });
  return total;
}

/**
 * Voronoi of `points` (bounds = municipal bbox expanded by 10 % and by the points themselves),
 * each cell ∩ municipality, cells unioned per key. A key whose cells fall entirely outside the
 * municipality gets no entry.
 */
export function voronoiAreas(municipality: MultiPolygon, input: AreaPoint[]): AreaResult {
  const keysIn = new Set(input.map((p) => p.key));
  const areas = new Map<string, MultiPolygon>();
  let fallbacks = 0;
  let respread = 0;
  if (input.length === 0) return { areas, jittered: 0, merged: 0, fallbacks, respread };
  if (keysIn.size === 1) {
    areas.set(input[0]!.key, municipality);
    return { areas, jittered: 0, merged: 0, fallbacks, respread };
  }
  let [x0, y0, x1, y1] = bbox(municipality);
  for (const p of input) {
    x0 = Math.min(x0, p.lon);
    y0 = Math.min(y0, p.lat);
    x1 = Math.max(x1, p.lon);
    y1 = Math.max(y1, p.lat);
  }
  const mx = (x1 - x0) * 0.1 + 1e-2;
  const my = (y1 - y0) * 0.1 + 1e-2;
  const bounds = [x0 - mx, y0 - my, x1 + mx, y1 + my] as const;
  const boundsArea = (bounds[2] - bounds[0]) * (bounds[3] - bounds[1]);
  // d3-delaunay can emit overlapping cells for points ~1e-6° apart; verify that the cells tile the
  // bounds (Σ area = bounds area) and widen the spread radius until they do.
  let chosen: {
    points: AreaPoint[];
    jittered: number;
    merged: number;
    cells: ([number, number][] | null)[];
  } | null = null;
  for (const radius of SPREAD_RADII) {
    const d = dedupePoints(input, radius);
    const voronoi = Delaunay.from(
      d.points,
      (p) => p.lon,
      (p) => p.lat,
    ).voronoi([...bounds]);
    const cells = d.points.map((_, i) => voronoi.cellPolygon(i) as [number, number][] | null);
    const sum = cells.reduce((s, c) => s + (c ? Math.abs(ringArea(c)) : 0), 0);
    chosen = { ...d, cells };
    if (Math.abs(sum / boundsArea - 1) < 1e-6) break;
    respread++;
  }
  const { points, jittered, merged, cells } = chosen!;
  const cellsByKey = new Map<string, Polygon[]>();
  points.forEach((p, i) => {
    const cell = cells[i];
    if (!cell || cell.length < 4) return;
    const list = cellsByKey.get(p.key) ?? [];
    list.push([cell.map(([x, y]) => [snap(x), snap(y)] as [number, number])]);
    cellsByKey.set(p.key, list);
  });
  for (const [key, cells] of cellsByKey) {
    const u = robustUnion(cells.map((c) => [c]));
    fallbacks += u.fallback ? 1 : 0;
    let clipped: MultiPolygon;
    try {
      clipped = polygonClipping.intersection(u.geom, municipality);
    } catch {
      // Robustness fallback: clip each cell separately, then union what survives.
      fallbacks++;
      const parts: MultiPolygon[] = [];
      for (const c of cells) {
        try {
          const x = polygonClipping.intersection(c, municipality);
          if (x.length > 0) parts.push(x);
        } catch {
          /* cell lost: reported through the coverage check */
        }
      }
      clipped = robustUnion(parts).geom;
    }
    if (clipped.length > 0) areas.set(key, clipped);
  }
  return { areas, jittered, merged, fallbacks, respread };
}

/** Snap to a 1e-9° grid so shared Voronoi edges are bit-identical for the clipper. */
const snap = (v: number) => Math.round(v * 1e9) / 1e9;

/**
 * polygon-clipping union with a fallback for its known float-robustness failures: incremental
 * union, keeping a part that cannot be merged as a separate polygon of the MultiPolygon.
 */
export function robustUnion(parts: MultiPolygon[]): { geom: MultiPolygon; fallback: boolean } {
  if (parts.length === 0) return { geom: [], fallback: false };
  if (parts.length === 1) return { geom: parts[0]!, fallback: false };
  try {
    return { geom: polygonClipping.union(parts[0]!, ...parts.slice(1)), fallback: false };
  } catch {
    let acc: MultiPolygon = parts[0]!;
    const loose: MultiPolygon = [];
    for (const p of parts.slice(1)) {
      try {
        acc = polygonClipping.union(acc, p);
      } catch {
        loose.push(...p);
      }
    }
    return { geom: [...acc, ...loose], fallback: true };
  }
}

/** Douglas–Peucker on one closed ring (tolerance in degrees); keeps the ring closed and ≥ 4 positions. */
export function simplifyRing(ring: Ring, tol: number): Ring {
  if (ring.length <= 5) return ring;
  const pts = ring.slice(0, -1);
  const keep = new Uint8Array(pts.length);
  keep[0] = 1;
  keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length > 0) {
    const [a, b] = stack.pop()!;
    const [ax, ay] = pts[a]!;
    const [bx, by] = pts[b]!;
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let best = -1;
    let bestD = 0;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = pts[i]!;
      let d: number;
      if (len2 === 0) d = Math.hypot(px - ax, py - ay);
      else {
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
        d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
      }
      if (d > bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best >= 0 && bestD > tol) {
      keep[best] = 1;
      stack.push([a, best], [best, b]);
    }
  }
  const out = pts.filter((_, i) => keep[i] === 1);
  if (out.length < 3) return ring;
  out.push([out[0]![0], out[0]![1]]);
  return out;
}

export const simplifyMulti = (mp: MultiPolygon, tol: number): MultiPolygon =>
  mp.map((poly) => poly.map((r) => simplifyRing(r, tol)));
