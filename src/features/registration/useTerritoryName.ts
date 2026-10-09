import type { TerritoryIndexEntry } from '@shared/contracts/territory.ts';
import { useTerritoryIndex } from '@/features/electoral-map/hooks';
import { territoryLabel } from '@/features/territory/search';

/**
 * Human label for a territory id, using the static index. `null` while the index
 * loads; the raw id only when the index loaded and does not know the territory.
 */
export function useTerritoryName(id: string | null): {
  label: string | null;
  entry: TerritoryIndexEntry | null;
} {
  const { index, isLoading } = useTerritoryIndex();
  if (!id || (!index && isLoading)) return { label: null, entry: null };
  const entry = index?.byId.get(id) ?? null;
  return { label: entry ? territoryLabel(entry) : id, entry };
}
