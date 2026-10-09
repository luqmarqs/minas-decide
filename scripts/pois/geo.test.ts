import { describe, expect, it } from 'vitest';
import { distanceM } from '../tse/president-2022.ts';
import { assignMunicipality, dedupe, inPolygon, type Polygonal, type RawPoi } from './geo.ts';

const square: Polygonal = {
  type: 'Polygon',
  coordinates: [
    [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ],
    [
      [4, 4],
      [6, 4],
      [6, 6],
      [4, 6],
      [4, 4],
    ],
  ],
};

describe('ray casting', () => {
  it('handles outer ring and holes', () => {
    expect(inPolygon([1, 1], square)).toBe(true);
    expect(inPolygon([5, 5], square)).toBe(false); // in the hole
    expect(inPolygon([11, 5], square)).toBe(false);
  });
  it('handles MultiPolygon', () => {
    const mp: Polygonal = {
      type: 'MultiPolygon',
      coordinates: [
        square.coordinates,
        [
          [
            [20, 20],
            [21, 20],
            [21, 21],
            [20, 21],
            [20, 20],
          ],
        ],
      ],
    };
    expect(inPolygon([20.5, 20.5], mp)).toBe(true);
  });
  it('assigns by polygon, then nearest centroid', () => {
    const f = [{ properties: { codarea: '3106200' }, geometry: square }];
    const c = [{ id: 'mg-3100104', lon: 50, lat: 50 }];
    expect(assignMunicipality([1, 1], f, c)).toEqual({ id: 'mg-3106200', method: 'polygon' });
    expect(assignMunicipality([49, 49], f, c)).toEqual({ id: 'mg-3100104', method: 'nearest' });
  });
});

describe('dedupe', () => {
  const poi = (
    id: number,
    cat: RawPoi['category'],
    lon: number,
    lat: number,
    type = 'node',
  ): RawPoi => ({
    id: `osm-${type}-${id}`,
    name: `P${id}`,
    category: cat,
    coordinates: [lon, lat],
    osm_type: type,
    osm_id: id,
  });
  it('drops bus duplicates closer than 60 m and keeps the terminal', () => {
    const items = [
      poi(2, 'bus_station', -43.9, -19.9),
      poi(1, 'bus_terminal', -43.9003, -19.9, 'way'), // ~31 m
      poi(3, 'bus_station', -43.91, -19.9), // ~1 km
    ];
    const { kept, dropped } = dedupe(items, 60, distanceM);
    expect(dropped).toBe(1);
    expect(kept.map((k) => k.id).sort()).toEqual(['osm-node-3', 'osm-way-1']);
  });
  it('keeps a metro station next to a bus terminal', () => {
    const { kept } = dedupe(
      [poi(1, 'bus_terminal', -43.9, -19.9), poi(2, 'metro_station', -43.9001, -19.9)],
      60,
      distanceM,
    );
    expect(kept).toHaveLength(2);
  });
});
