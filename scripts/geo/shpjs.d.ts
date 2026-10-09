/** Minimal typing for shpjs 6 (ships without types): zip/shapefile buffer → GeoJSON. */
declare module 'shpjs' {
  interface ShpFeature {
    type: 'Feature';
    properties: Record<string, unknown>;
    geometry: { type: string; coordinates: unknown } | null;
  }
  interface ShpCollection {
    type: 'FeatureCollection';
    features: ShpFeature[];
    fileName?: string;
  }
  export default function shp(
    input: ArrayBuffer | Uint8Array | string,
  ): Promise<ShpCollection | ShpCollection[]>;
}
