import { describe, expect, it } from 'vitest';
import type { TerritoryIndexEntry } from '@shared/contracts/territory.ts';
import { buildDemoSnapshot } from '@/fixtures/electoral/demo';
import { buildSearchIndex, searchTerritories, territoryLabel } from './search';

const docs = buildSearchIndex(buildDemoSnapshot().index);
const labels = (q: string, limit = 20) => searchTerritories(docs, q, limit).map((r) => r.label);

describe('territorial search (spec §4.7)', () => {
  it('T01: disambiguates a homonymous neighborhood across municipalities', () => {
    const res = labels('jardim exemplo');
    expect(res).toContain('Jardim Exemplo — Vale Demo/MG');
    expect(res).toContain('Jardim Exemplo — Morro Simulado/MG');
    // Same name, different ids → distinct entries.
    const ids = searchTerritories(docs, 'jardim exemplo', 20).map((r) => r.entry.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('T01: "Centro" lists one option per municipality, each labelled with its municipality', () => {
    const res = labels('centro');
    expect(res.length).toBeGreaterThan(5);
    expect(res.every((l) => /^Centro — .+\/MG$/.test(l))).toBe(true);
  });

  it('narrows a neighborhood by municipality words ("centro vale")', () => {
    expect(labels('centro vale')[0]).toBe('Centro — Vale Demo/MG');
  });

  it('normalizes accents, case, hyphens and whitespace', () => {
    expect(labels('ribeirao ficticio')[0]).toBe('Ribeirão Fictício/MG');
    expect(labels('  RIBEIRÃO   fictício ')[0]).toBe('Ribeirão Fictício/MG');
    expect(labels('beira rio')).toContain('Beira-Rio Demo — Rio Protótipo/MG');
    expect(labels('beira-rio')).toContain('Beira-Rio Demo — Rio Protótipo/MG');
  });

  it('prioritizes municipalities over neighborhoods', () => {
    const res = searchTerritories(docs, 'vale', 10);
    expect(res[0]?.entry.type).toBe('municipality');
    expect(res[0]?.label).toBe('Vale Demo/MG');
  });

  it('returns nothing for empty or unmatched queries', () => {
    expect(labels('')).toEqual([]);
    expect(labels('   ')).toEqual([]);
    expect(labels('zzzz inexistente')).toEqual([]);
  });

  it('respects the result limit', () => {
    expect(searchTerritories(docs, 'centro', 3)).toHaveLength(3);
  });

  it('labels each territory type', () => {
    const base = { name: 'Centro', municipality_name: 'Vale Demo' } as Pick<
      TerritoryIndexEntry,
      'name' | 'municipality_name'
    >;
    expect(territoryLabel({ ...base, type: 'neighborhood' })).toBe('Centro — Vale Demo/MG');
    expect(territoryLabel({ ...base, name: 'Vale Demo', type: 'municipality' })).toBe(
      'Vale Demo/MG',
    );
    expect(territoryLabel({ ...base, type: 'state' })).toBe('Minas Gerais (estado)');
  });
});
