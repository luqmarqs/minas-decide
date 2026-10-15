import type { TerritoryIndexEntry } from '@shared/contracts/territory.ts';
import { normalizeText } from '@shared/schemas/normalize.ts';

/**
 * Matches the city (and, when present, the neighborhood) of a geocoded place with the static
 * territory index. A neighborhood only matches inside the matched municipality; "approximate
 * neighborhoods" of the snapshot are voting-place based, so when the name is unknown we fall
 * back to the municipality. Returns null when the city is not in the index.
 */
export function matchTerritory(
  index: { municipalities: TerritoryIndexEntry[]; childrenOf: Map<string, TerritoryIndexEntry[]> },
  city: string | null,
  neighborhood: string | null,
): TerritoryIndexEntry | null {
  if (!city) return null;
  const wantCity = normalizeText(city);
  const muni = index.municipalities.find((m) => normalizeText(m.name) === wantCity);
  if (!muni) return null;
  if (neighborhood) {
    const wantN = normalizeText(neighborhood);
    const hood = (index.childrenOf.get(muni.id) ?? []).find(
      (n) => n.type === 'neighborhood' && normalizeText(n.name) === wantN,
    );
    if (hood) return hood;
  }
  return muni;
}
