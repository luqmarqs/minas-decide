import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { MapLayerCode } from '@shared/contracts/metrics.ts';
import type { TerritoryIndexEntry } from '@shared/contracts/territory.ts';
import { loadSnapshot, type SnapshotClient } from './snapshot';

export const snapshotKeys = {
  root: ['snapshot'] as const,
  index: (rel: string) => ['snapshot', rel, 'index'] as const,
  metrics: (rel: string, id: string) => ['snapshot', rel, 'metrics', id] as const,
  layer: (rel: string, y: number, r: number, l: string, c: string | null) =>
    ['snapshot', rel, 'layer', y, r, l, c] as const,
  methodology: (rel: string) => ['snapshot', rel, 'methodology'] as const,
  candidates: (rel: string) => ['snapshot', rel, 'candidates'] as const,
};

export function useSnapshot() {
  return useQuery<SnapshotClient>({
    queryKey: snapshotKeys.root,
    queryFn: () => loadSnapshot(),
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
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

export function useTerritoryIndex() {
  const snap = useSnapshot();
  const client = snap.data;
  const q = useQuery({
    queryKey: snapshotKeys.index(client?.releaseId ?? 'none'),
    queryFn: () => client!.getIndex(),
    enabled: !!client,
    staleTime: Infinity,
    gcTime: Infinity,
  });
  const index = useMemo(() => (q.data ? buildTerritoryIndex(q.data) : undefined), [q.data]);
  return {
    index,
    snapshot: client,
    isLoading: snap.isLoading || q.isLoading,
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

export function useLayerValues(
  layer: MapLayerCode,
  year: number,
  round: number,
  candidateId: string | null,
) {
  const { data: client } = useSnapshot();
  const needsCandidate = layer === 'votes' || layer === 'comparison';
  return useQuery({
    queryKey: snapshotKeys.layer(client?.releaseId ?? 'none', year, round, layer, candidateId),
    queryFn: () => client!.getLayer(year, round, layer, needsCandidate ? candidateId : null),
    enabled: !!client && layer !== 'activities' && (!needsCandidate || !!candidateId),
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

export function useCandidates() {
  const { data: client } = useSnapshot();
  return useQuery({
    queryKey: snapshotKeys.candidates(client?.releaseId ?? 'none'),
    queryFn: () => client!.getCandidates(),
    enabled: !!client,
    staleTime: Infinity,
  });
}
