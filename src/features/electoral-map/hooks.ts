import { useQueries, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { MapLayerCode } from '@shared/contracts/metrics.ts';
import type { TerritoryIndexEntry } from '@shared/contracts/territory.ts';
import type { SnapshotClient } from './snapshot';

export const snapshotKeys = {
  root: ['snapshot'] as const,
  index: (rel: string) => ['snapshot', rel, 'index'] as const,
  metrics: (rel: string, id: string) => ['snapshot', rel, 'metrics', id] as const,
  layer: (rel: string, y: number, r: number, l: string, c: string | null) =>
    ['snapshot', rel, 'layer', y, r, l, c] as const,
  methodology: (rel: string) => ['snapshot', rel, 'methodology'] as const,
  candidates: (rel: string) => ['snapshot', rel, 'candidates'] as const,
  highlights: (rel: string) => ['snapshot', rel, 'highlights'] as const,
  pois: (rel: string) => ['snapshot', rel, 'pois'] as const,
};

/**
 * The loader (and Zod + contracts) lives in a separate chunk: the first paint of
 * the public pages never waits for it (P-PERF-1).
 */
const loadSnapshotLazy = async () => (await import('./snapshot')).loadSnapshot();

export interface LazyDataOptions {
  /**
   * `false` = do not trigger the download; only read what another component has
   * already loaded (e.g. the footer, or the search before the first interaction).
   */
  enabled?: boolean;
}

export function useSnapshot({ enabled = true }: LazyDataOptions = {}) {
  return useQuery<SnapshotClient>({
    queryKey: snapshotKeys.root,
    queryFn: loadSnapshotLazy,
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
    enabled,
  });
}

export interface TerritoryIndex {
  entries: TerritoryIndexEntry[];
  byId: Map<string, TerritoryIndexEntry>;
  childrenOf: Map<string, TerritoryIndexEntry[]>;
  municipalities: TerritoryIndexEntry[];
}

export function buildTerritoryIndex(entries: TerritoryIndexEntry[]): TerritoryIndex {
  const byId = new Map<string, TerritoryIndexEntry>();
  const childrenOf = new Map<string, TerritoryIndexEntry[]>();
  const municipalities: TerritoryIndexEntry[] = [];
  for (const e of entries) {
    byId.set(e.id, e);
    if (e.type === 'municipality') municipalities.push(e);
    if (e.parent_id) {
      const list = childrenOf.get(e.parent_id) ?? [];
      list.push(e);
      childrenOf.set(e.parent_id, list);
    }
  }
  const collator = new Intl.Collator('pt-BR');
  municipalities.sort((a, b) => collator.compare(a.name, b.name));
  for (const list of childrenOf.values()) list.sort((a, b) => collator.compare(a.name, b.name));
  return { entries, byId, childrenOf, municipalities };
}

/** Territories index (~2 MB). Pass `enabled: false` to defer it until needed. */
export function useTerritoryIndex({ enabled = true }: LazyDataOptions = {}) {
  const snap = useSnapshot({ enabled });
  const client = snap.data;
  const q = useQuery({
    queryKey: snapshotKeys.index(client?.releaseId ?? 'none'),
    queryFn: () => client!.getIndex(),
    enabled: !!client && enabled,
    staleTime: Infinity,
    gcTime: Infinity,
  });
  const index = useMemo(() => (q.data ? buildTerritoryIndex(q.data) : undefined), [q.data]);
  return {
    index,
    snapshot: client,
    isLoading: enabled && (snap.isLoading || q.isLoading),
    error: snap.error ?? q.error,
    refetch: q.refetch,
  };
}

export function useMunicipalityMetrics(municipalityId: string | null) {
  const { data: client } = useSnapshot();
  return useQuery({
    queryKey: snapshotKeys.metrics(client?.releaseId ?? 'none', municipalityId ?? 'none'),
    queryFn: () => client!.getMunicipalityMetrics(municipalityId!),
    enabled: !!client && !!municipalityId,
    staleTime: Infinity,
  });
}

type MetricsFile = Awaited<ReturnType<SnapshotClient['getMunicipalityMetrics']>>;
// Stable reference: `combine` only re-runs (new array) when a query result changes.
const pickFiles = (rs: { data?: MetricsFile }[]) => rs.map((r) => r.data ?? null);

/**
 * Metrics files of several municipalities (neighborhood areas drawn on screen, FE-10), same
 * cache keys as `useMunicipalityMetrics`. Returns a stable array of files (null = missing).
 */
export function useMunicipalitiesMetrics(municipalityIds: string[]): (MetricsFile | null)[] {
  const { data: client } = useSnapshot();
  return useQueries({
    queries: municipalityIds.map((id) => ({
      queryKey: snapshotKeys.metrics(client?.releaseId ?? 'none', id),
      queryFn: () => client!.getMunicipalityMetrics(id),
      enabled: !!client,
      staleTime: Infinity,
    })),
    combine: pickFiles,
  });
}

export function useLayerValues(
  layer: MapLayerCode,
  year: number,
  round: number,
  candidateId: string | null,
  { enabled = true }: LazyDataOptions = {},
) {
  const { data: client } = useSnapshot();
  const needsCandidate =
    layer === 'votes' || layer === 'comparison' || layer === 'president_comparison';
  // Overlays have no layer file; 'mobilization' is derived in the browser (D27).
  const overlay = layer === 'activities' || layer === 'pois' || layer === 'mobilization';
  return useQuery({
    queryKey: snapshotKeys.layer(client?.releaseId ?? 'none', year, round, layer, candidateId),
    queryFn: () => client!.getLayer(year, round, layer, needsCandidate ? candidateId : null),
    enabled: !!client && enabled && !overlay && (!needsCandidate || !!candidateId),
    staleTime: Infinity,
  });
}

export function useMethodology() {
  const { data: client } = useSnapshot();
  return useQuery({
    queryKey: snapshotKeys.methodology(client?.releaseId ?? 'none'),
    queryFn: () => client!.getMethodology(),
    enabled: !!client,
    staleTime: Infinity,
  });
}

/** Candidate list (~280 KB); only fetched when a layer needs a candidate. */
export function useCandidates({ enabled = true }: LazyDataOptions = {}) {
  const { data: client } = useSnapshot();
  return useQuery({
    queryKey: snapshotKeys.candidates(client?.releaseId ?? 'none'),
    queryFn: () => client!.getCandidates(),
    enabled: !!client && enabled,
    staleTime: Infinity,
  });
}

/** "Por que Minas decide" numbers. `data === null` = not published in this release. */
export function useHighlights({ enabled = true }: LazyDataOptions = {}) {
  const { data: client } = useSnapshot({ enabled });
  return useQuery({
    queryKey: snapshotKeys.highlights(client?.releaseId ?? 'none'),
    queryFn: () => client!.getHighlights(),
    enabled: !!client && enabled,
    staleTime: Infinity,
  });
}

/** Terminals/stations (OSM). Only fetched when the overlay or a list needs it. */
export function usePois({ enabled = true }: LazyDataOptions = {}) {
  const { data: client } = useSnapshot({ enabled });
  return useQuery({
    queryKey: snapshotKeys.pois(client?.releaseId ?? 'none'),
    queryFn: () => client!.getPois(),
    enabled: !!client && enabled,
    staleTime: Infinity,
    retry: false,
  });
}
