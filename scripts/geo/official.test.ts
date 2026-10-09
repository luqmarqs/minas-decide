import { describe, expect, it } from 'vitest';
import { slugify } from '../../shared/schemas/normalize.ts';
import { matchNeighbourhoods, officialSlug, pickProp, stripPrefix } from './official.ts';
import { simplifyRing } from './voronoi.ts';

describe('matchNeighbourhoods', () => {
  it('matches identical slugs first (accents/case normalized by the shared slugify)', () => {
    const r = matchNeighbourhoods(
      [slugify('CENTRO'), slugify('Pau-D’Óleo')],
      [officialSlug('Centro'), officialSlug("Pau-D'Óleo")],
    );
    expect(r.matched.size).toBe(2);
    expect([...r.how.values()]).toEqual(['direct', 'direct']);
    expect(r.unmatchedIndex).toEqual([]);
  });

  it('strips "bairro-"/"vila-" only when there is no direct match, on either side', () => {
    const r = matchNeighbourhoods(
      ['vila-nova', 'santa-ines', 'bairro-alto'],
      ['nova', 'vila-santa-ines', 'alto'],
    );
    expect(r.matched.get('vila-nova')).toBe('nova');
    expect(r.matched.get('santa-ines')).toBe('vila-santa-ines');
    expect(r.matched.get('bairro-alto')).toBe('alto');
    expect(r.how.get('vila-nova')).toBe('prefix');
  });

  it('keeps a direct match even if a prefixed variant also exists, and never guesses among duplicates', () => {
    const r = matchNeighbourhoods(['nova', 'vila-nova'], ['nova']);
    expect(r.matched.get('nova')).toBe('nova');
    expect(r.unmatchedIndex).toEqual(['vila-nova']);
    const amb = matchNeighbourhoods(['vila-sol', 'bairro-sol'], ['sol']);
    expect(amb.matched.size).toBe(0);
    expect(amb.unmatchedOfficial).toEqual(['sol']);
  });

  it('does not strip other prefixes (Jardim/Parque are part of the name)', () => {
    expect(stripPrefix('jardim-america')).toBe('jardim-america');
    expect(stripPrefix('vila')).toBe('vila');
    expect(matchNeighbourhoods(['jardim-america'], ['america']).matched.size).toBe(0);
  });
});

describe('pickProp', () => {
  it('reads properties case-insensitively, first non-empty wins', () => {
    expect(pickProp({ cd_mun: '3106200', NM_BAIRRO: ' Savassi ' }, ['CD_MUN'])).toBe('3106200');
    expect(pickProp({ nome: '', name: 'Lourdes' }, ['NM_BAIRRO', 'nome', 'name'])).toBe('Lourdes');
    expect(pickProp({ codarea: 3106200 }, ['codarea'])).toBe('3106200');
    expect(pickProp({}, ['x'])).toBeUndefined();
  });
});

describe('simplifyRing', () => {
  it('drops collinear points within tolerance and keeps the ring closed', () => {
    const ring: [number, number][] = [
      [0, 0],
      [0.5, 0.000001],
      [1, 0],
      [1, 1],
      [0.5, 1],
      [0, 1],
      [0, 0],
    ];
    const s = simplifyRing(ring, 1e-5);
    expect(s).toEqual([
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
      [0, 0],
    ]);
  });
});
