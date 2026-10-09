import type { PoiFile } from '@shared/contracts/snapshot.ts';

export type PoiItem = PoiFile['items'][number];
export type PoiCategory = PoiItem['category'];

export const POI_CATEGORY_LABEL: Record<PoiCategory, string> = {
  bus_terminal: 'Terminal de ônibus',
  bus_station: 'Rodoviária',
  metro_station: 'Estação de metrô ou trem',
  market: 'Mercado',
  other: 'Local de grande circulação',
};

/** POIs of one municipality, sorted by name (pt-BR). */
export function poisOfMunicipality(items: PoiItem[] | null | undefined, municipalityId: string) {
  const collator = new Intl.Collator('pt-BR');
  return (items ?? [])
    .filter((p) => p.municipality_id === municipalityId)
    .sort((a, b) => collator.compare(a.name, b.name));
}
