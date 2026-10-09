/**
 * Electoral snapshot loader (spec §4.12, ADR 0004). Reads
 * `${VITE_SNAPSHOT_BASE ?? '/data'}/manifest.json`, validates every file with the
 * Zod contracts and exposes typed getters. If the manifest is missing (404),
 * unreachable, not JSON (e.g. SPA fallback HTML) or invalid, it falls back to the
 * SYNTHETIC demo fixture — whose status is 'demo' and is always labelled in the UI.
 * The browser never queries a database for electoral data.
 */
import { z } from 'zod';
import {
  MapLayerValues,
  SnapshotManifest,
  type MapLayerCode,
  type SnapshotStatus,
} from '@shared/contracts/metrics.ts';
import { TerritoryIndexEntry } from '@shared/contracts/territory.ts';
import {
  CandidateIndex,
  Highlights,
  Methodology,
  MunicipalityMetricsFile,
  PoiFile,
  SNAPSHOT_BASE_DEFAULT,
  layerFilePath,
  metricsFilePath,
} from '@shared/contracts/snapshot.ts';

export type SnapshotMode = 'remote' | 'demo';

export interface SnapshotClient {
  mode: SnapshotMode;
  manifest: SnapshotManifest;
  status: SnapshotStatus;
  releaseId: string;
  /** Why the demo fixture is in use (diagnostics; not shown verbatim to users). */
  fallbackReason: string | null;
  getIndex(): Promise<TerritoryIndexEntry[]>;
  /** `null` when the snapshot has no file for that municipality. */
  getMunicipalityMetrics(municipalityId: string): Promise<MunicipalityMetricsFile | null>;
  /** `null` when the layer file does not exist for that year/round/candidate. */
  getLayer(
    year: number,
    round: number,
    layer: MapLayerCode,
    candidateId?: string | null,
  ): Promise<MapLayerValues | null>;
  getMethodology(): Promise<Methodology>;
  getCandidates(): Promise<CandidateIndex>;
  /**
   * "Por que Minas decide" key numbers (`<release>/highlights.json`). `null` when the
   * release has no such file yet; the demo client returns a SYNTHETIC, labelled fixture.
   */
  getHighlights(): Promise<Highlights | null>;
  /**
   * Points of interest (`pois/terminais-mg.json`, OpenStreetMap/ODbL). Independent of the
   * electoral release (also read in demo mode); `null` when the file is not published.
   */
  getPois(): Promise<PoiFile | null>;
}

/** Path of the POI file, relative to the snapshot base (not inside a release). */
export const POI_FILE_PATH = 'pois/terminais-mg.json';

export class SnapshotFileError extends Error {
  constructor(
    readonly path: string,
    readonly reason: 'network' | 'http' | 'parse' | 'schema',
    readonly status = 0,
  ) {
    super(`Snapshot file ${path} failed (${reason}${status ? ` ${status}` : ''})`);
    this.name = 'SnapshotFileError';
  }
}

export function snapshotBase(): string {
  const raw = import.meta.env.VITE_SNAPSHOT_BASE ?? SNAPSHOT_BASE_DEFAULT;
  const base = typeof raw === 'string' && raw.trim() ? raw.trim() : SNAPSHOT_BASE_DEFAULT;
  return base.endsWith('/') ? base.slice(0, -1) : base;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** Lets the browser paint/handle input between chunks of heavy validation. */
const yieldToMain = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * Validates a large array (territories index, ~7k entries) in chunks so no single
 * main-thread task blocks input for long (P-PERF-1, TBT). Same Zod contract.
 */
export async function parseArrayChunked<S extends z.ZodType>(
  schema: S,
  json: unknown,
  path: string,
  chunk = 800,
): Promise<z.infer<S>[]> {
  if (!Array.isArray(json)) throw new SnapshotFileError(path, 'schema');
  const out: z.infer<S>[] = [];
  for (let i = 0; i < json.length; i += chunk) {
    if (i > 0) await yieldToMain();
    const parsed = z.array(schema).safeParse(json.slice(i, i + chunk));
    if (!parsed.success) throw new SnapshotFileError(path, 'schema');
    for (const item of parsed.data as z.infer<S>[]) out.push(item);
  }
  return out;
}

async function fetchValidated<S extends z.ZodType>(
  fetchImpl: FetchLike,
  url: string,
  path: string,
  schema: S | null,
  opts: { nullOn404?: boolean } = {},
): Promise<z.infer<S> | null> {
  let res: Response;
  try {
    res = await fetchImpl(url, { headers: { Accept: 'application/json' } });
  } catch {
    throw new SnapshotFileError(path, 'network');
  }
  if (res.status === 404 && opts.nullOn404) return null;
  if (!res.ok) throw new SnapshotFileError(path, 'http', res.status);
  const contentType = res.headers.get('content-type') ?? '';
  if (contentType.includes('text/html')) {
    // Dev server / static host SPA fallback: the file does not exist.
    if (opts.nullOn404) return null;
    throw new SnapshotFileError(path, 'http', 404);
  }
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new SnapshotFileError(path, 'parse');
  }
  if (schema === null) return json as z.infer<S>; // caller validates (chunked)
  const parsed = schema.safeParse(json);
  if (!parsed.success) throw new SnapshotFileError(path, 'schema');
  return parsed.data as z.infer<S>;
}

function poiLoader(fetchImpl: FetchLike, base: string): () => Promise<PoiFile | null> {
  let p: Promise<PoiFile | null> | null = null;
  return () => {
    p ??= fetchValidated(fetchImpl, `${base}/${POI_FILE_PATH}`, POI_FILE_PATH, PoiFile, {
      nullOn404: true,
    });
    p.catch(() => {
      p = null;
    });
    return p;
  };
}

function remoteClient(
  fetchImpl: FetchLike,
  base: string,
  manifest: SnapshotManifest,
): SnapshotClient {
  const rel = manifest.release_id;
  const url = (path: string) => `${base}/${path}`;
  const cache = new Map<string, Promise<unknown>>();
  function once<T>(key: string, fn: () => Promise<T>): Promise<T> {
    let p = cache.get(key) as Promise<T> | undefined;
    if (!p) {
      p = fn();
      cache.set(key, p);
      p.catch(() => cache.delete(key));
    }
    return p;
  }
  return {
    mode: 'remote',
    manifest,
    status: manifest.status,
    releaseId: rel,
    fallbackReason: null,
    getIndex: () =>
      once('index', async () => {
        const path = `${rel}/territories-index.json`;
        const raw = await fetchValidated(fetchImpl, url(path), path, null);
        return parseArrayChunked(TerritoryIndexEntry, raw, path);
      }),
    getMunicipalityMetrics: (municipalityId) =>
      once(`m:${municipalityId}`, () => {
        const path = metricsFilePath(rel, municipalityId);
        return fetchValidated(fetchImpl, url(path), path, MunicipalityMetricsFile, {
          nullOn404: true,
        });
      }),
    getLayer: (year, round, layer, candidateId) =>
      once(`l:${year}:${round}:${layer}:${candidateId ?? ''}`, () => {
        const path = layerFilePath(rel, year, round, layer, candidateId);
        return fetchValidated(fetchImpl, url(path), path, MapLayerValues, { nullOn404: true });
      }),
    getMethodology: () =>
      once('methodology', async () => {
        const path = `${rel}/methodology.json`;
        return (await fetchValidated(fetchImpl, url(path), path, Methodology))!;
      }),
    getCandidates: () =>
      once('candidates', async () => {
        const path = `${rel}/candidates.json`;
        return (await fetchValidated(fetchImpl, url(path), path, CandidateIndex))!;
      }),
    getHighlights: () =>
      once('highlights', () => {
        const path = `${rel}/highlights.json`;
        return fetchValidated(fetchImpl, url(path), path, Highlights, { nullOn404: true });
      }),
    getPois: poiLoader(fetchImpl, base),
  };
}

async function demoClient(
  reason: string,
  fetchImpl: FetchLike,
  base: string,
): Promise<SnapshotClient> {
  const { buildDemoSnapshot } = await import('@/fixtures/electoral/demo');
  const demo = buildDemoSnapshot();
  const rel = demo.manifest.release_id;
  return {
    mode: 'demo',
    manifest: demo.manifest,
    status: 'demo',
    releaseId: rel,
    fallbackReason: reason,
    getIndex: async () => demo.index,
    getMunicipalityMetrics: async (id) => demo.metrics[metricsFilePath(rel, id)] ?? null,
    getLayer: async (year, round, layer, cand) =>
      demo.layers[layerFilePath(rel, year, round, layer, cand)] ?? null,
    getMethodology: async () => demo.methodology,
    getCandidates: async () => demo.candidates,
    getHighlights: async () => demo.highlights,
    // POIs are not electoral data: the published OSM file is used when it exists.
    getPois: poiLoader(fetchImpl, base),
  };
}

export interface LoadSnapshotOptions {
  fetchImpl?: FetchLike;
  base?: string;
}

export async function loadSnapshot(opts: LoadSnapshotOptions = {}): Promise<SnapshotClient> {
  const fetchImpl: FetchLike = opts.fetchImpl ?? ((i, init) => fetch(i, init));
  const base = opts.base ?? snapshotBase();
  try {
    const manifest = await fetchValidated(
      fetchImpl,
      `${base}/manifest.json`,
      'manifest.json',
      SnapshotManifest,
    );
    if (!manifest) return demoClient('manifest ausente', fetchImpl, base);
    return remoteClient(fetchImpl, base, manifest);
  } catch (err) {
    const reason =
      err instanceof SnapshotFileError
        ? `${err.reason}${err.status ? ` ${err.status}` : ''}`
        : 'erro';
    return demoClient(`manifest indisponível (${reason})`, fetchImpl, base);
  }
}

export { SNAPSHOT_STATUS_LABEL } from './snapshotStatus';
