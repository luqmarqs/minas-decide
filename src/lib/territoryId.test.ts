import { describe, expect, it } from 'vitest';
import { TerritoryId } from '@shared/contracts/territory.ts';
import { isTerritoryId } from './territoryId';

describe('isTerritoryId mirrors the TerritoryId contract', () => {
  const samples = [
    'mg',
    'mg-3140001',
    'mg-3140001-centro',
    'mg-3106200-santa-efigenia',
    'mg-314000',
    'mg-31400011',
    'MG-3140001',
    'mg-3140001-Centro',
    'mg-3140001--x',
    'sp-3550308',
    '',
    'mg-3140001-centro-',
    'mg-centro',
    '../etc',
  ];
  it.each(samples)('%s', (s) => {
    expect(isTerritoryId(s)).toBe(TerritoryId.safeParse(s).success);
  });
});
