import { describe, expect, it } from 'vitest';
import polygonClipping from 'polygon-clipping';
import {
  dedupePoints,
  multiAreaKm2,
  ringArea,
  roundMulti,
  voronoiAreas,
  type MultiPolygon,
} from './voronoi.ts';

/** Synthetic municipality: 0.1° × 0.1° square near BH. */
const SQ: MultiPolygon = [
  [
    [
      [-44.0, -20.0],
      [-43.9, -20.0],
      [-43.9, -19.9],
      [-44.0, -19.9],
      [-44.0, -20.0],
    ],
  ],
];
const planar = (mp: MultiPolygon) =>
  mp.reduce(
    (s, poly) => s + poly.reduce((t, r, i) => t + (i === 0 ? 1 : -1) * Math.abs(ringArea(r)), 0),
    0,
  );

describe('voronoiAreas (synthetic municipality, 3 points)', () => {
  const pts = [
    { key: 'a', lon: -43.98, lat: -19.98 },
    { key: 'b', lon: -43.92, lat: -19.98 },
    { key: 'c', lon: -43.95, lat: -19.92 },
  ];
  const { areas } = voronoiAreas(SQ, pts);

  it('gives every neighbourhood an area that tiles the municipality', () => {
    expect([...areas.keys()].sort()).toEqual(['a', 'b', 'c']);
    const total = [...areas.values()].reduce((s, g) => s + planar(g), 0);
    expect(total).toBeCloseTo(0.01, 9);
  });

  it('keeps every area inside the municipality and without overlaps', () => {
    for (const g of areas.values())
      expect(planar(polygonClipping.difference(g, SQ))).toBeLessThan(1e-12);
    const [a, b, c] = ['a', 'b', 'c'].map((k) => areas.get(k)!);
    expect(planar(polygonClipping.intersection(a!, b!))).toBeLessThan(1e-12);
    expect(planar(polygonClipping.intersection(b!, c!))).toBeLessThan(1e-12);
  });

  it('splits symmetrically: a and b (mirror images) get the same area', () => {
    expect(planar(areas.get('a')!)).toBeCloseTo(planar(areas.get('b')!), 9);
  });

  it('unions cells of the same neighbourhood', () => {
    const r = voronoiAreas(SQ, [...pts, { key: 'a', lon: -43.98, lat: -19.92 }]);
    expect(r.areas.size).toBe(3);
    expect(planar(r.areas.get('a')!)).toBeGreaterThan(planar(areas.get('a')!));
  });

  it('single neighbourhood → whole municipal polygon', () => {
    const r = voronoiAreas(SQ, [pts[0]!, { ...pts[1]!, key: 'a' }]);
    expect(r.areas.get('a')).toBe(SQ);
  });

  it('coincident points of different neighbourhoods both keep a non-trivial area', () => {
    const r = voronoiAreas(SQ, [...pts, { key: 'd', lon: -43.95, lat: -19.92 }]);
    expect(r.jittered).toBe(2);
    expect(planar(r.areas.get('c')!)).toBeGreaterThan(1e-4);
    expect(planar(r.areas.get('d')!)).toBeGreaterThan(1e-4);
    const total = [...r.areas.values()].reduce((s, g) => s + planar(g), 0);
    expect(total).toBeCloseTo(0.01, 9);
  });
});

describe('dedupePoints', () => {
  it('merges same key at the same location and spreads different keys on a circle', () => {
    const r = dedupePoints([
      { key: 'x', lon: -44, lat: -20 },
      { key: 'x', lon: -44, lat: -20 },
      { key: 'y', lon: -44.000001, lat: -20 },
    ]);
    expect(r.merged).toBe(1);
    expect(r.jittered).toBe(2);
    expect(r.points).toHaveLength(2);
    expect(r.points[0]!.lon).not.toBe(r.points[1]!.lon);
  });
});

describe('roundMulti / multiAreaKm2', () => {
  it('rounds, keeps rings closed and drops degenerate polygons', () => {
    const mp: MultiPolygon = [
      [
        [
          [-44.000001, -20.000001],
          [-43.9, -20],
          [-43.9, -19.9],
          [-44, -19.9],
          [-44.000001, -20.000001],
        ],
      ],
      [
        [
          [-43.0000001, -20],
          [-43.0000002, -20],
          [-43.0000001, -20.0000001],
          [-43.0000001, -20],
        ],
      ],
    ];
    const r = roundMulti(mp, 5);
    expect(r).toHaveLength(1);
    const ring = r[0]![0]!;
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    expect(ring[0]).toEqual([-44, -20]);
  });

  it('0.1° square at 20°S ≈ 116 km² (equirectangular approximation)', () => {
    expect(multiAreaKm2(SQ)).toBeGreaterThan(115);
    expect(multiAreaKm2(SQ)).toBeLessThan(117.5);
  });
});
