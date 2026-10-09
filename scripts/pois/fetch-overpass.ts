/**
 * Rodada 3: high foot-traffic points of interest (bus terminals, BRT/MOVE stations, BH metro) from
 * OpenStreetMap via the Overpass API → public/data/pois/terminais-mg.json (PoiFile, ODbL 1.0).
 *
 *   npm run pois:fetch [-- --offline] [--force] [--out public/data/pois/terminais-mg.json]
 *
 * One combined query (timeout 180 s), retries with exponential backoff and an endpoint fallback;
 * the raw response is cached in data/private/overpass/ (gitignored) so reruns do not hit Overpass.
 * municipality_id: point-in-polygon (ray casting) against public/geo/mg-municipios.geojson;
 * fallback = nearest municipality centroid from the current snapshot index.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { PoiFile } from '../../shared/contracts/snapshot.ts';
import { distanceM } from '../tse/president-2022.ts';
import { assignMunicipality, dedupe, type Polygonal, type RawPoi } from './geo.ts';

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
const QUERY = `[out:json][timeout:180];
area["ISO3166-2"="BR-MG"]["admin_level"="4"]->.mg;
(
  nwr["amenity"="bus_station"](area.mg);
  nwr["public_transport"="station"]["bus"="yes"](area.mg);
  nwr["railway"="station"]["station"="subway"](area.mg);
  nwr["public_transport"="station"]["network"~"MOVE|BRT"](area.mg);
);
out center tags;`;

const argv = process.argv.slice(2);
const arg = (k: string): string | undefined => {
  const i = argv.indexOf(k);
  const v = i >= 0 ? argv[i + 1] : undefined;
  return v && !v.startsWith('--') ? v : undefined;
};
const OFFLINE = argv.includes('--offline');
const FORCE = argv.includes('--force');
const cacheFile = resolve(join('data', 'private', 'overpass', 'terminais-mg-raw.json'));
const outFile = resolve(arg('--out') ?? join('public', 'data', 'pois', 'terminais-mg.json'));
const geoFile = resolve(join('public', 'geo', 'mg-municipios.geojson'));
const UA = 'minas-decide-poi-fetch/1.0 (offline ETL; one query per run)';
const log = (m: string) => console.log(`[pois] ${m}`);

interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}
interface RawCache {
  endpoint: string;
  fetched_at: string;
  osm_base: string | null;
  elements: OverpassElement[];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchOverpass(): Promise<RawCache> {
  if (!FORCE && existsSync(cacheFile)) {
    log(`cache hit ${cacheFile}`);
    return JSON.parse(readFileSync(cacheFile, 'utf8')) as RawCache;
  }
  if (OFFLINE) throw new Error(`--offline and no cache at ${cacheFile}`);
  const errors: string[] = [];
  for (const endpoint of ENDPOINTS) {
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) {
        const wait = 15000 * 2 ** (attempt - 1);
        log(`retry ${attempt} on ${endpoint} in ${wait / 1000}s`);
        await sleep(wait);
      }
      try {
        const ctl = new AbortController();
        const timer = setTimeout(() => ctl.abort(), 200_000);
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'data=' + encodeURIComponent(QUERY),
          signal: ctl.signal,
        });
        clearTimeout(timer);
        log(`${endpoint} → HTTP ${res.status}`);
        if (res.status === 429 || res.status === 504 || res.status >= 500) {
          errors.push(`${endpoint} HTTP ${res.status}`);
          continue;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as {
          elements: OverpassElement[];
          osm3s?: { timestamp_osm_base?: string };
          remark?: string;
        };
        if (json.remark && /runtime error|timed out/i.test(json.remark))
          throw new Error(`Overpass remark: ${json.remark}`);
        const c: RawCache = {
          endpoint,
          fetched_at: new Date().toISOString(),
          osm_base: json.osm3s?.timestamp_osm_base ?? null,
          elements: json.elements,
        };
        mkdirSync(dirname(cacheFile), { recursive: true });
        writeFileSync(cacheFile, JSON.stringify(c), 'utf8');
        return c;
      } catch (e) {
        errors.push(`${endpoint}: ${(e as Error).message}`);
        log(`error: ${(e as Error).message}`);
      }
    }
  }
  throw new Error(`Overpass unavailable: ${errors.join(' | ')}`);
}

/** amenity=bus_station → bus_terminal, except BRT/MOVE stations (network MOVE|BRT) → bus_station;
 *  subway → metro_station; other public_transport=station + bus=yes → bus_station. */
function category(t: Record<string, string>): RawPoi['category'] {
  if (t['railway'] === 'station' && t['station'] === 'subway') return 'metro_station';
  if (/MOVE|BRT/i.test(t['network'] ?? '')) return 'bus_station';
  if (t['amenity'] === 'bus_station') return 'bus_terminal';
  return 'bus_station';
}

async function main() {
  const raw = await fetchOverpass();
  let noName = 0;
  let noCoord = 0;
  const items: RawPoi[] = [];
  for (const e of raw.elements) {
    const t = e.tags ?? {};
    const name = (t['name'] ?? '').trim();
    if (!name) {
      noName++;
      continue;
    }
    const lat = e.lat ?? e.center?.lat;
    const lon = e.lon ?? e.center?.lon;
    if (lat === undefined || lon === undefined) {
      noCoord++;
      continue;
    }
    items.push({
      id: `osm-${e.type}-${e.id}`,
      name,
      category: category(t),
      coordinates: [Math.round(lon * 1e6) / 1e6, Math.round(lat * 1e6) / 1e6],
      osm_type: e.type,
      osm_id: e.id,
    });
  }
  const { kept, dropped } = dedupe(items, 60, distanceM);

  const geo = JSON.parse(readFileSync(geoFile, 'utf8')) as {
    features: { properties: { codarea: string }; geometry: Polygonal }[];
  };
  const manifest = JSON.parse(readFileSync(resolve('public/data/manifest.json'), 'utf8')) as {
    release_id: string;
  };
  const index = JSON.parse(
    readFileSync(resolve(`public/data/${manifest.release_id}/territories-index.json`), 'utf8'),
  ) as { id: string; type: string; centroid: [number, number] | null }[];
  const centroids = index
    .filter((e) => e.type === 'municipality' && e.centroid)
    .map((e) => ({ id: e.id, lon: e.centroid![0], lat: e.centroid![1] }));
  let pip = 0;
  let nearest = 0;
  const out: PoiFile = {
    generated_at: new Date().toISOString(),
    source: `OpenStreetMap via Overpass API (${raw.endpoint}); dados OSM de ${raw.osm_base ?? raw.fetched_at}; consulta em ${raw.fetched_at}`,
    license: 'ODbL 1.0',
    attribution: '© OpenStreetMap contributors',
    items: kept.map((p) => {
      const r = assignMunicipality(p.coordinates, geo.features, centroids);
      if (r.method === 'polygon') pip++;
      else if (r.method === 'nearest') nearest++;
      return {
        id: p.id,
        name: p.name,
        category: p.category,
        coordinates: p.coordinates,
        municipality_id: r.id,
        osm_url: `https://www.openstreetmap.org/${p.osm_type}/${p.osm_id}`,
      };
    }),
  };
  out.items.sort(
    (a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name, 'pt-BR'),
  );
  const parsed = PoiFile.parse(out);
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, JSON.stringify(parsed), 'utf8');

  const byCat: Record<string, number> = {};
  const byMun: Record<string, number> = {};
  for (const i of parsed.items) {
    byCat[i.category] = (byCat[i.category] ?? 0) + 1;
    const k = i.municipality_id ?? '(sem município)';
    byMun[k] = (byMun[k] ?? 0) + 1;
  }
  log(
    `elements=${raw.elements.length} sem_nome=${noName} sem_coord=${noCoord} dedupe_removidos=${dropped} publicados=${parsed.items.length}`,
  );
  log(
    `municipality: polygon=${pip} nearest_centroid=${nearest} none=${parsed.items.length - pip - nearest}`,
  );
  log(`por categoria: ${JSON.stringify(byCat)}`);
  log(
    `top 10 municípios: ${Object.entries(byMun)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([k, v]) => `${k}=${v}`)
      .join(', ')}`,
  );
  log(`→ ${outFile}`);
}

main().catch((e) => {
  console.error(`[pois] FAILED: ${(e as Error).message}`);
  process.exit(1);
});
