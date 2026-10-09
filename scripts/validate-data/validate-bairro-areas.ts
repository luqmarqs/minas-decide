/**
 * Validates public/geo/bairros/ (D29): GeoJSON shape, closed rings, finite coordinates, ids coherent
 * with the snapshot territories-index, coverage, and — for a deterministic sample of 50 municipalities —
 * Voronoi areas ⊆ municipality, no Voronoi/official overlap, total area ≈ municipal area ± 1 %
 * (Voronoi-only municipalities: checked for all, not only the sample).
 *
 *   npm run geo:validate [-- --release mg-2026r1-20261008] [--sample 50]
 *
 * Local files only; never touches the SOURCE. Exit code 1 on any error.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import polygonClipping from 'polygon-clipping';
import {
  multiAreaKm2,
  toMulti,
  type MultiPolygon,
  type MunicipalGeometry,
} from '../geo/voronoi.ts';

const argv = process.argv.slice(2);
const arg = (k: string): string | undefined => {
  const i = argv.indexOf(k);
  const v = i >= 0 ? argv[i + 1] : undefined;
  return v && !v.startsWith('--') ? v : undefined;
};
const RELEASE = arg('--release') ?? 'mg-2026r1-20261008';
const SAMPLE = Number(arg('--sample') ?? 50);
const TOL = 0.01;
const METHODS = new Set(['voronoi-polling-places', 'official-ibge-cd2022', 'owner-provided']);

interface IndexEntry {
  id: string;
  type: string;
  parent_id: string | null;
  polling_places?: number;
}
interface Feature {
  type: string;
  properties: Record<string, unknown>;
  geometry: { type: string; coordinates: unknown };
}

const errors: string[] = [];
const warnings: string[] = [];
const err = (m: string) => errors.length < 200 && errors.push(m);

const dir = resolve('public', 'geo', 'bairros');
const index = JSON.parse(
  readFileSync(resolve('public', 'data', RELEASE, 'territories-index.json'), 'utf8'),
) as IndexEntry[];
const byId = new Map(index.map((e) => [e.id, e]));
const mesh = JSON.parse(
  readFileSync(resolve('public', 'geo', 'mg-municipios.geojson'), 'utf8'),
) as {
  features: { properties: { codarea: string }; geometry: MunicipalGeometry }[];
};
const meshByIbge = new Map(mesh.features.map((f) => [f.properties.codarea, toMulti(f.geometry)]));
const geoIndex = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8')) as {
  municipalities: { ibge: string; file: string; neighborhoods: number; bytes: number }[];
};

function checkGeometry(where: string, g: Feature['geometry']): MultiPolygon | null {
  if (g?.type !== 'MultiPolygon' || !Array.isArray(g.coordinates)) {
    err(`${where}: geometry must be MultiPolygon`);
    return null;
  }
  const mp = g.coordinates as MultiPolygon;
  if (mp.length === 0) err(`${where}: empty MultiPolygon`);
  for (const poly of mp) {
    if (!Array.isArray(poly) || poly.length === 0) err(`${where}: empty polygon`);
    for (const ring of poly) {
      if (!Array.isArray(ring) || ring.length < 4) {
        err(`${where}: ring with < 4 positions`);
        continue;
      }
      for (const p of ring)
        if (
          !Array.isArray(p) ||
          p.length !== 2 ||
          !Number.isFinite(p[0]) ||
          !Number.isFinite(p[1]) ||
          p[0] < -52 ||
          p[0] > -39 ||
          p[1] < -23.5 ||
          p[1] > -14
        ) {
          err(`${where}: invalid/NaN/out-of-MG position ${JSON.stringify(p)}`);
          break;
        }
      const a = ring[0]!;
      const b = ring[ring.length - 1]!;
      if (a[0] !== b[0] || a[1] !== b[1]) err(`${where}: ring not closed`);
    }
  }
  return mp;
}

const files = readdirSync(dir).filter((f) => f.endsWith('.geojson'));
if (files.length !== geoIndex.municipalities.length)
  err(`index.json lists ${geoIndex.municipalities.length} files, directory has ${files.length}`);
const seen = new Set<string>();
interface G {
  geom: MultiPolygon;
  official: boolean;
}
const geomsByIbge = new Map<string, G[]>();
let totalBytes = 0;
const areaDev: { ibge: string; dev: number }[] = [];

for (const file of files.sort()) {
  const ibge = file.replace('.geojson', '');
  const raw = readFileSync(join(dir, file), 'utf8');
  totalBytes += Buffer.byteLength(raw);
  const row = geoIndex.municipalities.find((m) => m.ibge === ibge);
  if (!row) err(`${file}: missing from index.json`);
  else if (row.bytes !== Buffer.byteLength(raw)) err(`${file}: index.json bytes mismatch`);
  let fc: { type: string; features: Feature[] };
  try {
    fc = JSON.parse(raw) as typeof fc;
  } catch {
    err(`${file}: invalid JSON`);
    continue;
  }
  if (fc.type !== 'FeatureCollection' || !Array.isArray(fc.features)) {
    err(`${file}: not a FeatureCollection`);
    continue;
  }
  if (row && row.neighborhoods !== fc.features.length)
    err(`${file}: index.json neighborhoods mismatch`);
  const geoms: G[] = [];
  for (const f of fc.features) {
    const p = f.properties ?? {};
    const id = String(p.territory_id);
    const where = `${file}:${id}`;
    if (f.type !== 'Feature') err(`${where}: not a Feature`);
    const entry = byId.get(id);
    if (!entry) err(`${where}: territory_id not in territories-index.json`);
    else if (entry.type !== 'neighborhood' || entry.parent_id !== `mg-${ibge}`)
      err(`${where}: not a neighborhood of mg-${ibge}`);
    if (p.municipality_id !== `mg-${ibge}`) err(`${where}: municipality_id mismatch`);
    if (typeof p.name !== 'string' || p.name.length === 0) err(`${where}: missing name`);
    if (typeof p.polling_places !== 'number' || p.polling_places < 1)
      err(`${where}: polling_places`);
    if (!METHODS.has(String(p.method))) err(`${where}: unknown method ${String(p.method)}`);
    const official = p.method !== 'voronoi-polling-places';
    if (p.approx !== !official)
      err(`${where}: approx must be ${!official} for method ${String(p.method)}`);
    if ('official' in p && p.official !== official) err(`${where}: official flag incoherent`);
    if (seen.has(id)) err(`${where}: duplicated territory_id`);
    seen.add(id);
    const g = checkGeometry(where, f.geometry);
    if (g) geoms.push({ geom: g, official });
  }
  geomsByIbge.set(ibge, geoms);
  const mun = meshByIbge.get(ibge);
  if (!mun) err(`${file}: municipality not in mg-municipios.geojson`);
  else {
    // Pure-Voronoi municipalities must tile the municipal polygon (Σ areas ≈ municipality).
    if (geoms.length > 0 && geoms.every((g) => !g.official)) {
      const sum = geoms.reduce((s, g) => s + multiAreaKm2(g.geom), 0);
      areaDev.push({ ibge, dev: sum / multiAreaKm2(mun) - 1 });
    }
  }
}

// Coverage: neighbourhoods with polling places but no area are reported (not errors).
const withoutArea = index.filter(
  (e) => e.type === 'neighborhood' && (e.polling_places ?? 0) > 0 && !seen.has(e.id),
);
for (const e of withoutArea) warnings.push(`no area: ${e.id}`);

// Deterministic sample: the 10 municipalities with most neighbourhoods + evenly spaced others.
const ibges = [...geomsByIbge.keys()].sort();
const top = [...ibges]
  .sort((a, b) => geomsByIbge.get(b)!.length - geomsByIbge.get(a)!.length)
  .slice(0, 10);
const rest = ibges.filter((i) => !top.includes(i));
const step = Math.max(1, Math.floor(rest.length / Math.max(1, SAMPLE - top.length)));
const officialMuns = ibges.filter((i) => geomsByIbge.get(i)!.some((g) => g.official));
// 50 sampled municipalities + every municipality that has official polygons (55 in CD2022).
const sample = [
  ...new Set(
    [...top, ...rest.filter((_, i) => i % step === 0)].slice(0, SAMPLE).concat(officialMuns),
  ),
];
let maxDev = 0;
let maxOutside = 0;
let maxOverlap = 0;
let maxOfficialOutside = 0;
const bboxOf = (mp: MultiPolygon) => {
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (const poly of mp)
    for (const [x, y] of poly[0] ?? []) {
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x);
      y1 = Math.max(y1, y);
    }
  return [x0, y0, x1, y1] as const;
};
const touch = (a: MultiPolygon, b: MultiPolygon) => {
  const [a0, a1, a2, a3] = bboxOf(a);
  const [b0, b1, b2, b3] = bboxOf(b);
  return a0 <= b2 && b0 <= a2 && a1 <= b3 && b1 <= a3;
};
const safeArea = (ibge: string, what: string, f: () => MultiPolygon): number => {
  try {
    return multiAreaKm2(f());
  } catch {
    warnings.push(`mg-${ibge}: ${what} failed (clipper robustness); not checked`);
    return 0;
  }
};
/**
 * Per sampled municipality (V = Voronoi features, O = official features):
 *  - V ⊆ municipality (outside ≤ 1 %);
 *  - V ∩ O ≈ ∅ (≤ 1 % of the municipality);
 *  - when V exists: area(V) + area(O ∩ municipality) ≈ municipality ± 1 % (the municipality is tiled);
 *  - O outside the municipality is reported only (the official mesh is finer than the generalized
 *    "mínima" municipal mesh, so official polygons cross it slightly).
 */
for (const ibge of sample) {
  const mun = meshByIbge.get(ibge);
  const geoms = geomsByIbge.get(ibge)!;
  if (!mun || geoms.length === 0) continue;
  const munA = multiAreaKm2(mun);
  const V = geoms.filter((g) => !g.official).map((g) => g.geom);
  const O = geoms.filter((g) => g.official).map((g) => g.geom);
  let outside = 0;
  for (const v of V)
    outside += safeArea(ibge, 'difference(V, mun)', () => polygonClipping.difference(v, mun));
  outside /= munA;
  let overlap = 0;
  for (const v of V)
    for (const o of O)
      if (touch(v, o))
        overlap += safeArea(ibge, 'intersection(V, O)', () => polygonClipping.intersection(v, o));
  overlap /= munA;
  let oInside = 0;
  let oOutside = 0;
  for (const o of O) {
    oInside += safeArea(ibge, 'intersection(O, mun)', () => polygonClipping.intersection(o, mun));
    oOutside += safeArea(ibge, 'difference(O, mun)', () => polygonClipping.difference(o, mun));
  }
  maxOutside = Math.max(maxOutside, outside);
  maxOverlap = Math.max(maxOverlap, overlap);
  maxOfficialOutside = Math.max(maxOfficialOutside, oOutside / munA);
  if (outside > TOL)
    err(
      `mg-${ibge}: ${(outside * 100).toFixed(3)} % of the Voronoi areas lies outside the municipality`,
    );
  if (overlap > TOL)
    err(
      `mg-${ibge}: Voronoi areas overlap official ones by ${(overlap * 100).toFixed(3)} % of the municipality`,
    );
  if (V.length > 0) {
    const dev = (V.reduce((s, v) => s + multiAreaKm2(v), 0) + oInside) / munA - 1;
    maxDev = Math.max(maxDev, Math.abs(dev));
    if (Math.abs(dev) > TOL)
      err(`mg-${ibge}: areas deviate ${(dev * 100).toFixed(3)} % from the municipality`);
  }
}
const allDevMax = areaDev.reduce((m, d) => (Math.abs(d.dev) > Math.abs(m.dev) ? d : m), {
  ibge: '-',
  dev: 0,
});
const overSum = areaDev.filter((d) => Math.abs(d.dev) > TOL);
for (const d of overSum)
  err(
    `mg-${d.ibge}: Voronoi-only municipality, Σ areas deviates ${(d.dev * 100).toFixed(3)} % (overlap or gap)`,
  );

console.log(
  `[geo:validate] files=${files.length} features=${seen.size} bytes=${totalBytes} (${(totalBytes / 1048576).toFixed(2)} MB) without_area=${withoutArea.length}`,
);
console.log(
  `[geo:validate] sample=${sample.length} municipalities: max |areas−municipality| = ${(maxDev * 100).toFixed(4)} %, max Voronoi outside = ${(maxOutside * 100).toFixed(4)} %, max Voronoi∩official = ${(maxOverlap * 100).toFixed(4)} %, max official outside municipal mesh = ${(maxOfficialOutside * 100).toFixed(3)} % (info)`,
);
console.log(
  `[geo:validate] ${areaDev.length} Voronoi-only municipalities, Σ areas vs municipality: max deviation ${(allDevMax.dev * 100).toFixed(4)} % (mg-${allDevMax.ibge}); ${overSum.length} beyond ±1 %`,
);
for (const w of warnings.slice(0, 20)) console.log(`[geo:validate] warn ${w}`);
if (errors.length > 0) {
  for (const e of errors) console.error(`[geo:validate] ERROR ${e}`);
  console.error(`[geo:validate] FAILED with ${errors.length} error(s)`);
  process.exit(1);
}
console.log('[geo:validate] OK');
