/**
 * D29 / DATA-6 — neighbourhood areas, generated offline from local files (plus the public IBGE
 * Censo 2022 neighbourhood mesh, downloaded once and cached; never the SOURCE):
 *   - data/private/geo-input/*.{geojson,json,zip}  owner-provided limits (highest priority)
 *   - data/private/geo/ibge-bairros/MG_bairros_CD2022.zip  official IBGE CD2022 neighbourhoods
 *   - public/geo/mg-municipios.geojson (IBGE municipal mesh, properties.codarea = IBGE7)
 *   - data/private/extract/<release>/locais.json (polling places: cd_ibge, bairro, lat, lon, coord_aproximada)
 *   - public/data/<release>/territories-index.json (neighbourhood ids mg-<ibge7>-<slugify(bairro)>)
 *
 *   npm run geo:bairros [-- --release mg-2026r1-20261008] [--decimals 5] [--offline] [--no-official]
 *
 * Per municipality: neighbourhoods whose name matches an official/owner polygon use that polygon
 * (method official-ibge-cd2022 | owner-provided, approx=false). The others get the Voronoi of their
 * polling places (a neighbourhood's approximate coordinates excluded when it has precise ones),
 * clipped by the municipal polygon minus the matched official polygons, unioned per neighbourhood
 * (method voronoi-polling-places, approx=true); a single remaining neighbourhood gets the whole
 * remaining region. Output: public/geo/bairros/<ibge7>.geojson + index.json. If the total exceeds
 * 40 MB, coordinates are re-rounded to 4 decimals.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import polygonClipping from 'polygon-clipping';
import shp from 'shpjs';
import { normalizeText, slugify } from '../../shared/schemas/normalize.ts';
import { matchNeighbourhoods, officialSlug, pickProp } from './official.ts';
import {
  multiAreaKm2,
  robustUnion,
  roundMulti,
  simplifyMulti,
  toMulti,
  voronoiAreas,
  type AreaPoint,
  type MultiPolygon,
  type MunicipalGeometry,
} from './voronoi.ts';

const argv = process.argv.slice(2);
const arg = (k: string): string | undefined => {
  const i = argv.indexOf(k);
  const v = i >= 0 ? argv[i + 1] : undefined;
  return v && !v.startsWith('--') ? v : undefined;
};
const RELEASE = arg('--release') ?? 'mg-2026r1-20261008';
const REQUESTED_DECIMALS = Number(arg('--decimals') ?? 5);
const OFFLINE = argv.includes('--offline');
const NO_OFFICIAL = argv.includes('--no-official');
const MAX_TOTAL_BYTES = 40 * 1024 * 1024;
/** Douglas–Peucker tolerance for official polygons (degrees ≈ 1.1 m, the 5-decimal resolution). */
const SIMPLIFY_TOL = 1e-5;
const IBGE_URL =
  'https://geoftp.ibge.gov.br/organizacao_do_territorio/malhas_territoriais/malhas_de_setores_censitarios__divisoes_intramunicipais/censo_2022/bairros/shp/UF/MG_bairros_CD2022.zip';
const IBGE_CACHE = resolve('data', 'private', 'geo', 'ibge-bairros', 'MG_bairros_CD2022.zip');
const OWNER_DIR = resolve('data', 'private', 'geo-input');
const MATCH_REPORT = resolve('data', 'private', 'geo', 'match-report.json');

type Method = 'official-ibge-cd2022' | 'owner-provided' | 'voronoi-polling-places';
const METHODS: Method[] = ['owner-provided', 'official-ibge-cd2022', 'voronoi-polling-places'];

interface Local {
  id: number;
  cd_ibge: number;
  bairro: string;
  lat: number;
  lon: number;
  coord_aproximada: boolean;
}
interface IndexEntry {
  id: string;
  type: string;
  name: string;
  parent_id: string | null;
  ibge_code?: string | null;
  normalized_name?: string;
  polling_places?: number;
}
interface MunFeature {
  properties: { codarea: string };
  geometry: MunicipalGeometry;
}
interface OfficialArea {
  slug: string;
  names: Set<string>;
  codes: Set<string>;
  parts: MultiPolygon[];
  method: Exclude<Method, 'voronoi-polling-places'>;
}

const t0 = Date.now();
const locais = JSON.parse(
  readFileSync(resolve('data', 'private', 'extract', RELEASE, 'locais.json'), 'utf8'),
) as Local[];
const index = JSON.parse(
  readFileSync(resolve('public', 'data', RELEASE, 'territories-index.json'), 'utf8'),
) as IndexEntry[];
const mesh = JSON.parse(
  readFileSync(resolve('public', 'geo', 'mg-municipios.geojson'), 'utf8'),
) as {
  features: MunFeature[];
};
const indexById = new Map(index.map((e) => [e.id, e]));
const meshByIbge = new Map(mesh.features.map((f) => [f.properties.codarea, toMulti(f.geometry)]));
const warnings: string[] = [];

// ---------------------------------------------------------------- official / owner polygons
const munByName = new Map<string, string[]>();
for (const e of index)
  if (e.type === 'municipality' && e.ibge_code) {
    const k = e.normalized_name ?? normalizeText(e.name);
    munByName.set(k, [...(munByName.get(k) ?? []), e.ibge_code]);
  }

function polygonal(g: { type: string; coordinates: unknown } | null): MultiPolygon | null {
  if (!g) return null;
  if (g.type === 'Polygon') return [g.coordinates as MultiPolygon[number]];
  if (g.type === 'MultiPolygon') return g.coordinates as MultiPolygon;
  return null;
}
const plausibleLonLat = (mp: MultiPolygon) => {
  const p = mp[0]?.[0]?.[0];
  return !!p && p[0] > -52 && p[0] < -39 && p[1] > -23.5 && p[1] < -14;
};

type FeatureLike = {
  properties: Record<string, unknown>;
  geometry: { type: string; coordinates: unknown } | null;
};
async function readFeatures(file: string): Promise<FeatureLike[]> {
  const buf = readFileSync(file);
  if (file.toLowerCase().endsWith('.zip')) {
    const r = await shp(buf);
    return (Array.isArray(r) ? r : [r]).flatMap((c) => c.features);
  }
  const j = JSON.parse(buf.toString('utf8')) as { features?: FeatureLike[] };
  return j.features ?? [];
}

/** ibge7 → slug → area */
const official = new Map<string, Map<string, OfficialArea>>();
let officialFeatures = 0;
let ownerFeatures = 0;
let ibgeSource: { url: string; cache: string; bytes: number } | null = null;

function addOfficial(
  target: Map<string, Map<string, OfficialArea>>,
  ibge: string,
  name: string,
  code: string | undefined,
  geom: MultiPolygon,
  method: OfficialArea['method'],
) {
  const bySlug = target.get(ibge) ?? new Map<string, OfficialArea>();
  const slug = officialSlug(name);
  const a = bySlug.get(slug) ?? { slug, names: new Set(), codes: new Set(), parts: [], method };
  a.names.add(name);
  if (code) a.codes.add(code);
  a.parts.push(geom);
  bySlug.set(slug, a);
  target.set(ibge, bySlug);
}

const owner = new Map<string, Map<string, OfficialArea>>();
if (!NO_OFFICIAL && existsSync(OWNER_DIR)) {
  for (const f of readdirSync(OWNER_DIR).filter((n) => /\.(geojson|json|zip)$/i.test(n))) {
    let feats: FeatureLike[];
    try {
      feats = await readFeatures(join(OWNER_DIR, f));
    } catch (e) {
      warnings.push(`geo-input/${f}: ilegível (${(e as Error).message}); ignorado`);
      continue;
    }
    let skipped = 0;
    for (const ft of feats) {
      const g = polygonal(ft.geometry);
      const p = ft.properties ?? {};
      let ibge = pickProp(p, ['CD_MUN', 'cd_ibge', 'codarea', 'ibge', 'cod_ibge', 'ibge7']);
      if (!ibge) {
        const mn = pickProp(p, ['NM_MUN', 'municipio', 'municipality', 'nome_municipio']);
        const c = mn ? munByName.get(normalizeText(mn)) : undefined;
        if (c?.length === 1) ibge = c[0];
      }
      const name = pickProp(p, ['NM_BAIRRO', 'bairro', 'nome', 'name', 'NOME']);
      if (!g || !ibge || !/^31\d{5}$/.test(ibge) || !name || !plausibleLonLat(g)) {
        skipped++;
        continue;
      }
      addOfficial(
        owner,
        ibge,
        name,
        pickProp(p, ['CD_BAIRRO', 'codigo', 'id']),
        g,
        'owner-provided',
      );
      ownerFeatures++;
    }
    if (skipped > 0)
      warnings.push(
        `geo-input/${f}: ${skipped} feição(ões) ignorada(s) (sem município/bairro, geometria não poligonal ou fora de lon/lat de MG)`,
      );
  }
}

if (!NO_OFFICIAL) {
  if (!existsSync(IBGE_CACHE) && !OFFLINE) {
    console.log(`[geo] downloading IBGE CD2022 bairros (MG) → ${IBGE_CACHE}`);
    const res = await fetch(IBGE_URL);
    if (!res.ok) throw new Error(`IBGE download failed: HTTP ${res.status}`);
    mkdirSync(dirname(IBGE_CACHE), { recursive: true });
    writeFileSync(IBGE_CACHE, Buffer.from(await res.arrayBuffer()));
  }
  if (existsSync(IBGE_CACHE)) {
    ibgeSource = {
      url: IBGE_URL,
      cache: 'data/private/geo/ibge-bairros/MG_bairros_CD2022.zip',
      bytes: readFileSync(IBGE_CACHE).length,
    };
    for (const ft of await readFeatures(IBGE_CACHE)) {
      const g = polygonal(ft.geometry);
      const ibge = pickProp(ft.properties, ['CD_MUN']);
      const name = pickProp(ft.properties, ['NM_BAIRRO']);
      if (!g || !ibge || !name) continue;
      if (owner.has(ibge)) continue; // owner-provided wins for the whole municipality
      addOfficial(
        official,
        ibge,
        name,
        pickProp(ft.properties, ['CD_BAIRRO']),
        g,
        'official-ibge-cd2022',
      );
      officialFeatures++;
    }
  } else warnings.push('malha oficial IBGE CD2022 ausente (modo --offline); só Voronoi');
}
for (const [ibge, m] of owner) official.set(ibge, m);

// ---------------------------------------------------------------- per municipality
const nbIdOf = (l: Local) => `mg-${l.cd_ibge}-${slugify(l.bairro) || 'sem-bairro'}`;
const byMun = new Map<string, Local[]>();
for (const l of locais) {
  const k = String(l.cd_ibge);
  byMun.set(k, [...(byMun.get(k) ?? []), l]);
}

interface BuiltNb {
  id: string;
  polling_places: number;
  method: Method;
  whole: boolean;
  approxOnly: boolean;
  officialNames?: string[];
  officialCodes?: string[];
  match?: 'direct' | 'prefix';
  geom: MultiPolygon;
}
interface MatchRow {
  ibge: string;
  name: string;
  source: OfficialArea['method'];
  official: number;
  index: number;
  matched: number;
  matched_prefix: number;
  unmatched_official: string[];
  unmatched_index: string[];
}
const built: { ibge: string; neighborhoods: BuiltNb[] }[] = [];
const missing: { id: string; reason: string }[] = [];
const matchRows: MatchRow[] = [];
let jitteredTotal = 0;
let mergedTotal = 0;
let fallbackTotal = 0;
let respreadTotal = 0;
let approxOnlyTotal = 0;
let excludedApprox = 0;
let allApproxMuns = 0;
let complementFallbacks = 0;

for (const [ibge, list] of [...byMun.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  const mun = meshByIbge.get(ibge);
  const counts = new Map<string, number>();
  for (const l of list) counts.set(nbIdOf(l), (counts.get(nbIdOf(l)) ?? 0) + 1);
  for (const id of counts.keys())
    if (!indexById.has(id)) throw new Error(`territory ${id} not found in territories-index.json`);
  if (!mun) {
    warnings.push(`mg-${ibge}: sem polígono na malha IBGE; ${counts.size} bairro(s) sem área`);
    for (const id of counts.keys()) missing.push({ id, reason: 'municipio_sem_poligono' });
    continue;
  }
  const prefix = `mg-${ibge}-`;
  const nbs: BuiltNb[] = [];

  // 1. official / owner polygons for matched neighbourhoods
  const off = official.get(ibge);
  const matchedIds = new Set<string>();
  const officialGeoms: MultiPolygon[] = [];
  if (off) {
    const m = matchNeighbourhoods(
      [...counts.keys()].map((id) => id.slice(prefix.length)),
      off.keys(),
    );
    const source = [...off.values()][0]!.method;
    matchRows.push({
      ibge,
      name: indexById.get(`mg-${ibge}`)?.name ?? ibge,
      source,
      official: off.size,
      index: counts.size,
      matched: m.matched.size,
      matched_prefix: [...m.how.values()].filter((h) => h === 'prefix').length,
      unmatched_official: m.unmatchedOfficial.map((s) => [...off.get(s)!.names].join(' / ')),
      unmatched_index: m.unmatchedIndex.map((s) => indexById.get(prefix + s)!.name),
    });
    for (const [idxSlug, offSlug] of m.matched) {
      const a = off.get(offSlug)!;
      const id = prefix + idxSlug;
      const geom = simplifyMulti(robustUnion(a.parts).geom, SIMPLIFY_TOL);
      matchedIds.add(id);
      officialGeoms.push(geom);
      nbs.push({
        id,
        polling_places: counts.get(id)!,
        method: a.method,
        whole: false,
        approxOnly: false,
        officialNames: [...a.names],
        officialCodes: [...a.codes],
        match: m.how.get(idxSlug),
        geom,
      });
    }
  }

  // 2. Voronoi for the rest, inside municipality − matched official polygons
  const rest = [...counts.keys()].filter((id) => !matchedIds.has(id));
  if (rest.length > 0) {
    let region: MultiPolygon = mun;
    if (officialGeoms.length > 0) {
      try {
        region = polygonClipping.difference(mun, ...officialGeoms);
      } catch {
        complementFallbacks++;
        warnings.push(
          `mg-${ibge}: complemento das áreas oficiais falhou (robustez); Voronoi sobre o município inteiro (sobreposição possível)`,
        );
      }
    }
    const restSet = new Set(rest);
    const sub = list.filter((l) => restSet.has(nbIdOf(l)));
    const preciseIds = new Set(sub.filter((l) => !l.coord_aproximada).map(nbIdOf));
    const used = sub.filter((l) => !l.coord_aproximada || !preciseIds.has(nbIdOf(l)));
    const approxOnly = new Set(rest.filter((id) => !preciseIds.has(id)));
    approxOnlyTotal += approxOnly.size;
    excludedApprox += sub.length - used.length;
    if (preciseIds.size === 0) {
      allApproxMuns++;
      warnings.push(
        `mg-${ibge}: todos os ${sub.length} locais (sem área oficial) têm coordenada aproximada; usados assim mesmo`,
      );
    } else if (approxOnly.size > 0)
      warnings.push(
        `mg-${ibge}: ${approxOnly.size} bairro(s) só com coordenada aproximada (${[...approxOnly].join(', ')}); usadas assim mesmo`,
      );
    const points: AreaPoint[] = used.map((l) => ({ key: nbIdOf(l), lon: l.lon, lat: l.lat }));
    const res = voronoiAreas(region, points);
    jitteredTotal += res.jittered;
    mergedTotal += res.merged;
    fallbackTotal += res.fallbacks;
    respreadTotal += res.respread;
    if (res.fallbacks > 0)
      warnings.push(`mg-${ibge}: ${res.fallbacks} fallback(s) de robustez do recorte`);
    const usedKeys = new Set(points.map((p) => p.key));
    for (const id of rest.sort()) {
      const geom = res.areas.get(id);
      if (geom && multiAreaKm2(geom) > 0)
        nbs.push({
          id,
          polling_places: counts.get(id)!,
          method: 'voronoi-polling-places',
          whole: matchedIds.size === 0 && counts.size === 1,
          approxOnly: approxOnly.has(id),
          geom,
        });
      else
        missing.push({
          id,
          reason:
            region.length === 0
              ? 'municipio_coberto_por_bairros_oficiais'
              : usedKeys.has(id)
                ? 'locais_fora_da_regiao_disponivel'
                : 'sem_pontos_utilizaveis',
        });
    }
  }
  built.push({ ibge, neighborhoods: nbs.sort((a, b) => a.id.localeCompare(b.id)) });
}

// ---------------------------------------------------------------- render + write
const outDir = resolve('public', 'geo', 'bairros');
function render(decimals: number): { files: Map<string, string>; degenerate: string[] } {
  const files = new Map<string, string>();
  const degenerate: string[] = [];
  for (const b of built) {
    const features = b.neighborhoods
      .map((n) => ({ ...n, geom: roundMulti(n.geom, decimals) }))
      .filter((n) => {
        if (n.geom.length > 0) return true;
        degenerate.push(n.id);
        return false;
      })
      .map((n) => {
        const isOfficial = n.method !== 'voronoi-polling-places';
        return {
          type: 'Feature',
          properties: {
            territory_id: n.id,
            name: indexById.get(n.id)!.name,
            municipality_id: `mg-${b.ibge}`,
            polling_places: n.polling_places,
            approx: !isOfficial,
            official: isOfficial,
            method: n.method,
            whole_municipality: n.whole,
            approx_coords_only: n.approxOnly,
            ...(isOfficial
              ? {
                  official_name: n.officialNames!.join(' / '),
                  official_code: n.officialCodes!.join(',') || null,
                  match: n.match,
                }
              : {}),
          },
          geometry: { type: 'MultiPolygon', coordinates: n.geom },
        };
      });
    if (features.length > 0)
      files.set(`${b.ibge}.geojson`, JSON.stringify({ type: 'FeatureCollection', features }));
  }
  return { files, degenerate };
}

let decimals = REQUESTED_DECIMALS;
let r = render(decimals);
let total = [...r.files.values()].reduce((s, v) => s + Buffer.byteLength(v), 0);
if (total > MAX_TOTAL_BYTES && decimals > 4) {
  console.log(
    `[geo] total ${(total / 1048576).toFixed(2)} MB > 40 MB with ${decimals} decimals; re-rounding to 4`,
  );
  decimals = 4;
  r = render(decimals);
  total = [...r.files.values()].reduce((s, v) => s + Buffer.byteLength(v), 0);
}
for (const id of r.degenerate) missing.push({ id, reason: 'area_degenerada_apos_arredondamento' });

if (existsSync(outDir))
  for (const f of readdirSync(outDir))
    if (f.endsWith('.geojson') || f === 'index.json') rmSync(join(outDir, f));
mkdirSync(outDir, { recursive: true });
const emptyCounts = () => Object.fromEntries(METHODS.map((m) => [m, 0])) as Record<Method, number>;
const indexRows: {
  ibge: string;
  municipality_id: string;
  file: string;
  neighborhoods: number;
  by_method: Record<Method, number>;
  bytes: number;
}[] = [];
const totalsByMethod = emptyCounts();
for (const [name, body] of r.files) {
  writeFileSync(join(outDir, name), body);
  const ibge = name.replace('.geojson', '');
  const feats = (JSON.parse(body) as { features: { properties: { method: Method } }[] }).features;
  const by = emptyCounts();
  for (const f of feats) {
    by[f.properties.method]++;
    totalsByMethod[f.properties.method]++;
  }
  indexRows.push({
    ibge,
    municipality_id: `mg-${ibge}`,
    file: name,
    neighborhoods: feats.length,
    by_method: by,
    bytes: Buffer.byteLength(body),
  });
}

const withArea = new Set(
  indexRows.length ? built.flatMap((b) => b.neighborhoods.map((n) => n.id)) : [],
);
for (const m of missing) withArea.delete(m.id);
const indexNbs = index.filter((e) => e.type === 'neighborhood' && (e.polling_places ?? 0) > 0);
const missingIds = new Set(missing.map((m) => m.id));
for (const e of indexNbs)
  if (!withArea.has(e.id) && !missingIds.has(e.id))
    missing.push({ id: e.id, reason: 'sem_locais_no_extrato' });

const neighborhoodsWithArea = indexRows.reduce((s, x) => s + x.neighborhoods, 0);
const muniWithOfficial = matchRows.length;
const offTotals = matchRows.reduce(
  (s, m) => ({
    official: s.official + m.official,
    index: s.index + m.index,
    matched: s.matched + m.matched,
    matched_prefix: s.matched_prefix + m.matched_prefix,
  }),
  { official: 0, index: 0, matched: 0, matched_prefix: 0 },
);
const summary = {
  release: RELEASE,
  methods: METHODS,
  decimals,
  note: 'Bairros com limite oficial (IBGE Censo 2022 ou fornecido pelo proprietário) usam o polígono oficial (official=true). Os demais são áreas aproximadas (approx=true): Voronoi dos locais de votação recortado pela malha municipal do IBGE, fora das áreas oficiais; não são limites oficiais.',
  attribution:
    'Malha municipal: IBGE. Bairros oficiais: IBGE, Censo Demográfico 2022 (malha de bairros). Áreas aproximadas derivadas da malha IBGE e das coordenadas dos locais de votação.',
  sources: ibgeSource
    ? [
        {
          name: 'IBGE CD2022 bairros MG',
          url: ibgeSource.url,
          crs: 'SIRGAS 2000 (EPSG:4674), usado como WGS84',
        },
      ]
    : [],
  totals: {
    municipalities: indexRows.length,
    neighborhoods_with_area: neighborhoodsWithArea,
    neighborhoods_without_area: missing.length,
    by_method: totalsByMethod,
    municipalities_with_official_mesh: muniWithOfficial,
    official_neighborhoods_in_mesh: offTotals.official,
    official_matched: offTotals.matched,
    bytes: total,
  },
  municipalities: indexRows,
};
const indexBody = JSON.stringify(summary);
writeFileSync(join(outDir, 'index.json'), indexBody);
mkdirSync(dirname(MATCH_REPORT), { recursive: true });
writeFileSync(
  MATCH_REPORT,
  JSON.stringify({ totals: offTotals, municipalities: matchRows, missing }, null, 2),
);

// ---------------------------------------------------------------- report
const reasons = new Map<string, number>();
for (const m of missing) reasons.set(m.reason, (reasons.get(m.reason) ?? 0) + 1);
const top5 = [...indexRows].sort((a, b) => b.bytes - a.bytes).slice(0, 5);
console.log(
  `[geo] official: owner features=${ownerFeatures} (municipalities ${owner.size}), IBGE CD2022 features=${officialFeatures}; municipalities with official mesh and polling places=${muniWithOfficial}; official neighbourhoods=${offTotals.official}, index neighbourhoods there=${offTotals.index}, matched=${offTotals.matched} (prefix-stripped ${offTotals.matched_prefix}); match rate: ${((offTotals.matched / Math.max(1, offTotals.index)) * 100).toFixed(1)} % of index, ${((offTotals.matched / Math.max(1, offTotals.official)) * 100).toFixed(1)} % of official`,
);
console.log(
  `[geo] municipalities with locais=${byMun.size} files=${indexRows.length} neighborhoods_in_index_with_locais=${indexNbs.length} with_area=${neighborhoodsWithArea} without_area=${missing.length}; by method ${JSON.stringify(totalsByMethod)}`,
);
console.log(`[geo] without area by reason: ${JSON.stringify(Object.fromEntries(reasons))}`);
for (const m of missing.slice(0, 30)) console.log(`[geo]   - ${m.id}: ${m.reason}`);
console.log(
  `[geo] points: jittered=${jitteredTotal} merged=${mergedTotal} clip_fallbacks=${fallbackTotal} complement_fallbacks=${complementFallbacks} spread_radius_widened=${respreadTotal}; municipalities all-approx=${allApproxMuns}; approx locais excluded=${excludedApprox}; neighborhoods approx-only=${approxOnlyTotal}; decimals=${decimals}`,
);
console.log(
  `[geo] total=${total} bytes (${(total / 1048576).toFixed(2)} MB) + index.json ${Buffer.byteLength(indexBody)} bytes; top5: ${top5.map((x) => `${x.file}=${(x.bytes / 1024).toFixed(0)}KB/${x.neighborhoods}nb`).join(', ')}`,
);
const worst = [...matchRows]
  .sort(
    (a, b) =>
      b.unmatched_index.length +
      b.unmatched_official.length -
      (a.unmatched_index.length + a.unmatched_official.length),
  )
  .slice(0, 10);
console.log('[geo] top-10 municipalities by unmatched neighbourhoods (official mesh):');
for (const w of worst)
  console.log(
    `[geo]   mg-${w.ibge} ${w.name}: official=${w.official} index=${w.index} matched=${w.matched} unmatched_official=${w.unmatched_official.length} unmatched_index=${w.unmatched_index.length}`,
  );
for (const w of warnings) if (!/coordenada aproximada/.test(w)) console.log(`[geo] warn ${w}`);
console.log(
  `[geo] warnings about approximate coordinates: ${warnings.filter((w) => /coordenada aproximada/.test(w)).length}`,
);
console.log(`[geo] match report (names) → ${MATCH_REPORT}`);
console.log(`[geo] done in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
