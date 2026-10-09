import { describe, expect, it } from 'vitest';
import {
  buildEntry,
  deltaPp,
  distanceM,
  localKey,
  margin,
  matchLocal,
  matchRate,
  MIN_MATCH_RATE,
  share,
  symmetricDomain,
  ufRank,
  marginLayer,
  type Place2026,
} from './president-2022.ts';

describe('share / deltaPp / margin', () => {
  it('share is votes/valid, null without denominator', () => {
    expect(share(50, 200)).toBe(0.25);
    expect(share(5, 0)).toBeNull();
    expect(share(null, 10)).toBeNull();
    expect(share(10, null)).toBeNull();
  });

  it('deltaPp is (s2026 − s2022) in percentage points rounded to 0.01', () => {
    // MG state, Lula: 2026 r1 5.188.936/11.976.235, 2022 r1 5.802.571/12.016.633
    const s26 = 5188936 / 11976235;
    const s22 = 5802571 / 12016633;
    expect(deltaPp(s26, s22)).toBe(-4.96);
    expect(deltaPp(0.5, 0.25)).toBe(25);
    expect(deltaPp(0.123456, 0.1)).toBe(2.35);
    expect(deltaPp(null, 0.1)).toBeNull();
  });

  it('margin returns votes and pp of valid votes', () => {
    // MG 2022 2º turno (TSE): Lula 6.190.960, Bolsonaro 6.141.310, válidos 12.332.270
    expect(margin({ lula: 6190960, bolsonaro: 6141310, valid: 12332270 })).toEqual({
      votes: 49650,
      pp: 0.4,
    });
    expect(margin({ lula: 1, bolsonaro: 3, valid: 0 })).toEqual({ votes: -2, pp: 0 });
  });
});

describe('buildEntry', () => {
  it('fills 2022 r1/r2, 2026 and coherent deltas', () => {
    const e = buildEntry(
      'bolsonaro',
      { lula: 40, bolsonaro: 50, valid: 100 },
      { lula: 45, bolsonaro: 55, valid: 100 },
      70,
      200,
    );
    expect(e.ballot_name_2022).toBe('JAIR BOLSONARO');
    expect(e.ballot_name_2026).toBe('FLAVIO BOLSONARO');
    expect(e.number_2022).toBe(22);
    expect(e.share_2022_r1).toBe(0.5);
    expect(e.share_2022_r2).toBe(0.55);
    expect(e.share_2026_r1).toBe(0.35);
    expect(e.delta_pp_r1).toBe(-15);
    expect(e.delta_votes_r1).toBe(20);
  });

  it('leaves deltas null when 2022 is unavailable', () => {
    const e = buildEntry('lula', null, null, 10, 20);
    expect(e.votes_2022_r1).toBeNull();
    expect(e.share_2022_r1).toBeNull();
    expect(e.delta_pp_r1).toBeNull();
    expect(e.delta_votes_r1).toBeNull();
    expect(e.share_2026_r1).toBe(0.5);
  });
});

describe('matchLocal (2022 polling place → 2026 neighborhood)', () => {
  const places = new Map<string, Place2026>([
    [
      localKey('41238', 35, 1180),
      { neighborhood_id: 'mg-3106200-centro', lat: -19.93, lon: -43.93 },
    ],
    [
      localKey('41238', 35, 1200),
      { neighborhood_id: 'mg-3106200-savassi', lat: -19.94, lon: -43.94 },
    ],
    [localKey('41238', 36, 1015), { neighborhood_id: 'mg-3106200-barreiro', lat: null, lon: null }],
  ]);
  const nbs = new Set(['mg-3106200-centro', 'mg-3106200-savassi', 'mg-3106200-santa-efigenia']);
  const base = { cd_municipio: '41238', zona: 35, local: 1180, bairro: '', lat: null, lon: null };

  it('(a) same municipality + zone + place number', () => {
    expect(matchLocal(base, '3106200', places, nbs)).toEqual({
      neighborhood_id: 'mg-3106200-centro',
      method: 'same_place',
      rejected_far: false,
    });
    // leading zeros in the TSE code do not matter
    expect(matchLocal({ ...base, cd_municipio: '041238' }, '3106200', places, nbs).method).toBe(
      'same_place',
    );
  });

  it('(a) accepts when 2026 coordinates are approximate (null)', () => {
    const r = matchLocal(
      { ...base, zona: 36, local: 1015, lat: -20, lon: -44 },
      '3106200',
      places,
      nbs,
    );
    expect(r.neighborhood_id).toBe('mg-3106200-barreiro');
  });

  it('(a) rejects a same-number place more than 1 km away, then tries (b)', () => {
    const far = { ...base, lat: -19.93, lon: -43.9, bairro: 'Santa Efigênia' };
    expect(distanceM(-19.93, -43.93, -19.93, -43.9)).toBeGreaterThan(1000);
    expect(matchLocal(far, '3106200', places, nbs)).toEqual({
      neighborhood_id: 'mg-3106200-santa-efigenia',
      method: 'bairro_name',
      rejected_far: true,
    });
  });

  it('(b) normalizes the 2022 address neighborhood with slugify', () => {
    const r = matchLocal(
      { ...base, local: 9999, bairro: '  SANTA  EFIGÊNIA ' },
      '3106200',
      places,
      nbs,
    );
    expect(r).toEqual({
      neighborhood_id: 'mg-3106200-santa-efigenia',
      method: 'bairro_name',
      rejected_far: false,
    });
  });

  it('(c) unmatched when neither rule applies', () => {
    expect(
      matchLocal({ ...base, local: 9999, bairro: 'Inexistente' }, '3106200', places, nbs).method,
    ).toBe('none');
    expect(
      matchLocal({ ...base, local: 9999, bairro: '' }, '3106200', places, nbs).neighborhood_id,
    ).toBeNull();
  });

  it('match rate threshold', () => {
    expect(matchRate(80, 100)).toBe(0.8);
    expect(matchRate(80, 100) < MIN_MATCH_RATE).toBe(false);
    expect(matchRate(79, 100) < MIN_MATCH_RATE).toBe(true);
    expect(matchRate(0, 0)).toBe(0);
  });
});

describe('layer domain and UF ranking', () => {
  it('symmetricDomain uses the largest absolute value', () => {
    expect(symmetricDomain([-3.2, 1, 7.25])).toEqual([-7.25, 7.25]);
    expect(symmetricDomain([])).toEqual([-0, 0]);
  });
  it('ufRank ignores the exterior (ZZ)', () => {
    const by = {
      SP: { eligible: 30 },
      ZZ: { eligible: 25 },
      MG: { eligible: 16 },
      RJ: { eligible: 12 },
    };
    expect(ufRank(by, 'MG')).toBe(2);
    expect(ufRank(by, 'RJ')).toBe(3);
  });
});

describe('marginLayer', () => {
  it('computes pp margins, leader counts and extremes', () => {
    const r = marginLayer([
      { id: 'a', votes: { lula: 60, bolsonaro: 40, valid: 100 } },
      { id: 'b', votes: { lula: 30, bolsonaro: 50, valid: 100 } },
      { id: 'c', votes: { lula: 10, bolsonaro: 10, valid: 50 } },
      { id: 'd', votes: null },
    ]);
    expect(r.values).toEqual({ a: 20, b: -20, c: 0 });
    expect([r.lula, r.bolsonaro, r.tie]).toEqual([1, 1, 1]);
    expect(r.min).toEqual({ id: 'b', pp: -20 });
    expect(r.max).toEqual({ id: 'a', pp: 20 });
  });
});
