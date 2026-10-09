import { describe, expect, it } from 'vitest';
import { mapQuery, parseMapParams, serializeMapParams } from './useMapUrlState';

describe('map URL state (T24)', () => {
  it('round-trips a shared neighborhood link', () => {
    const qs = mapQuery({
      territoryId: 'mg-3100104-centro',
      layer: 'votes',
      year: 2022,
      round: 1,
      candidateId: 'demo-governor-a',
    });
    const parsed = parseMapParams(new URLSearchParams(qs));
    expect(parsed).toEqual({
      territoryId: 'mg-3100104-centro',
      layer: 'votes',
      year: 2022,
      round: 1,
      candidateId: 'demo-governor-a',
      view: 'mapa',
    });
    expect(qs).toContain('camada=votacao');
  });

  it('omits defaults and ignores invalid values', () => {
    expect(mapQuery({ layer: 'abstention', year: 2026, round: 1 })).toBe('');
    const p = parseMapParams(
      new URLSearchParams('t=<script>&camada=xyz&ano=abc&turno=7&cand=../../etc'),
    );
    expect(p.territoryId).toBeNull();
    expect(p.layer).toBe('abstention');
    expect(p.year).toBe(2026);
    expect(p.round).toBe(1);
    expect(p.candidateId).toBeNull();
  });

  it('removes keys set to null', () => {
    const sp = serializeMapParams(
      { territoryId: null },
      new URLSearchParams('t=mg-3100104&camada=atividades'),
    );
    expect(sp.toString()).toBe('camada=atividades');
  });
});
