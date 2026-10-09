/**
 * Client-side territorial search over the static territories index (spec §4.7).
 * Accent/case/hyphen/whitespace-insensitive (shared `normalizeText`), prioritises
 * municipalities, and disambiguates neighborhoods as "Bairro — Município/MG".
 * Multi-word queries may mix neighborhood and municipality ("centro vale").
 */
import { normalizeText } from '@shared/schemas/normalize.ts';
import type { TerritoryIndexEntry } from '@shared/contracts/territory.ts';

export interface SearchDoc {
  entry: TerritoryIndexEntry;
  label: string;
  name: string;
  nameWords: string[];
  fullWords: string[];
}

export interface SearchResult {
  entry: TerritoryIndexEntry;
  label: string;
  score: number;
}

export function territoryLabel(
  e: Pick<TerritoryIndexEntry, 'type' | 'name' | 'municipality_name'>,
): string {
  if (e.type === 'state') return 'Minas Gerais (estado)';
  if (e.type === 'municipality') return `${e.name}/MG`;
  return `${e.name} — ${e.municipality_name ?? 'município desconhecido'}/MG`;
}

export const TERRITORY_TYPE_LABEL: Record<TerritoryIndexEntry['type'], string> = {
  state: 'Estado',
  municipality: 'Município',
  neighborhood: 'Bairro (aprox.)',
};

export function buildSearchIndex(entries: TerritoryIndexEntry[]): SearchDoc[] {
  return entries.map((entry) => {
    const name = normalizeText(entry.name);
    const muni =
      entry.type === 'neighborhood' && entry.municipality_name
        ? normalizeText(entry.municipality_name)
        : '';
    const nameWords = name.split(' ').filter(Boolean);
    return {
      entry,
      label: territoryLabel(entry),
      name,
      nameWords,
      fullWords: muni ? [...nameWords, ...muni.split(' ').filter(Boolean)] : nameWords,
    };
  });
}

const TYPE_BOOST: Record<TerritoryIndexEntry['type'], number> = {
  municipality: 6,
  state: 3,
  neighborhood: 0,
};

function scoreDoc(doc: SearchDoc, q: string, tokens: string[]): number {
  let base = 0;
  if (doc.name === q) base = 100;
  else if (doc.name.startsWith(q)) base = 80;
  else if (tokens.every((t) => doc.nameWords.some((w) => w.startsWith(t)))) base = 60;
  else if (tokens.every((t) => doc.fullWords.some((w) => w.startsWith(t)))) base = 45;
  else if (q.length >= 3 && doc.name.includes(q)) base = 20;
  if (base === 0) return 0;
  return base + TYPE_BOOST[doc.entry.type];
}

export function searchTerritories(docs: SearchDoc[], rawQuery: string, limit = 8): SearchResult[] {
  const q = normalizeText(rawQuery);
  if (!q) return [];
  const tokens = q.split(' ').filter(Boolean);
  const collator = new Intl.Collator('pt-BR');
  const results: SearchResult[] = [];
  for (const doc of docs) {
    const score = scoreDoc(doc, q, tokens);
    if (score > 0) results.push({ entry: doc.entry, label: doc.label, score });
  }
  results.sort(
    (a, b) =>
      b.score - a.score ||
      a.entry.name.length - b.entry.name.length ||
      collator.compare(a.label, b.label),
  );
  return results.slice(0, limit);
}
