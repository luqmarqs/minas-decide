/**
 * Pure helpers for the presidential 2022 → 2026 comparison (rodada 3).
 * No I/O here: fetch-2022.ts produces the TSE aggregates, build-snapshot.ts consumes them,
 * and president-2022.test.ts covers the arithmetic and the polling-place matching.
 */
import { slugify } from '../../shared/schemas/normalize.ts';
import type {
  PresidentialCandidateKey,
  PresidentialComparisonEntry,
} from '../../shared/contracts/metrics.ts';

/** Votes of the two compared candidacies plus the office's valid votes in one territory/round. */
export interface PresVotes {
  lula: number;
  bolsonaro: number;
  valid: number;
}
/** Full municipality/state/national row for one round (TSE detalhe + candidato files). */
export interface PresRound extends PresVotes {
  eligible: number;
  turnout: number;
  abstention: number;
  blank: number;
  null_votes: number;
}

export interface SourceRecord {
  key: string;
  url: string;
  entries: string[];
  last_modified: string;
  generated_by_tse: string;
  note?: string;
}

/** The aggregate written by fetch-2022.ts to data/private/tse/2022/president-2022.json. */
export interface President2022File {
  schema: 'president-2022/v1';
  generated_at: string;
  sources: SourceRecord[];
  /** by TSE municipality code (cd_municipio as written by TSE, MG only) */
  municipalities: Record<string, { name: string; r1: PresRound; r2: PresRound }>;
  state_mg: { r1: PresRound; r2: PresRound };
  national: { r1: PresRound; r2: PresRound };
  /** eligible/turnout per UF (ZZ = exterior), round 1 */
  by_uf_r1: Record<string, { eligible: number; turnout: number }>;
  /** MG polling places with 2022 presidential votes (votacao_secao), keyed localKey(...) */
  locals: Record<string, Local2022>;
  /** reconciliation notes written by fetch-2022.ts */
  checks: string[];
}

export interface Local2022 {
  cd_municipio: string;
  zona: number;
  local: number;
  name: string;
  bairro: string;
  lat: number | null;
  lon: number | null;
  r1: PresVotes;
  r2: PresVotes;
}

/** 2026 national context (TSE detalhe_votacao_munzona_2026, BR entry, cargo 1, round 1). */
export interface National2026File {
  schema: 'national-2026/v1';
  source: SourceRecord;
  by_uf: Record<string, { eligible: number; turnout: number }>;
}

export const CANDIDATES: Record<
  PresidentialCandidateKey,
  { name_2022: string; name_2026: string; number_2022: number; number_2026: number }
> = {
  lula: { name_2022: 'LULA', name_2026: 'LULA', number_2022: 13, number_2026: 13 },
  bolsonaro: {
    name_2022: 'JAIR BOLSONARO',
    name_2026: 'FLAVIO BOLSONARO',
    number_2022: 22,
    number_2026: 22,
  },
};

export const emptyVotes = (): PresVotes => ({ lula: 0, bolsonaro: 0, valid: 0 });
export const emptyRound = (): PresRound => ({
  ...emptyVotes(),
  eligible: 0,
  turnout: 0,
  abstention: 0,
  blank: 0,
  null_votes: 0,
});

export function addInto<T extends object>(target: T, src: T): T {
  const t = target as Record<string, number>;
  for (const [k, v] of Object.entries(src as Record<string, number>)) t[k] = (t[k] ?? 0) + v;
  return target;
}

export function share(votes: number | null, valid: number | null): number | null {
  if (votes === null || valid === null || valid <= 0) return null;
  return Math.min(1, votes / valid);
}

/** share_2026 − share_2022 in percentage points, rounded to 0.01 pp (same rule as comparison_2022). */
export function deltaPp(s2026: number | null, s2022: number | null): number | null {
  if (s2026 === null || s2022 === null) return null;
  return Math.round((s2026 - s2022) * 10000) / 100;
}

/** Margin (lula − bolsonaro) in votes and in pp of valid votes (0.01 pp). */
export function margin(r: PresVotes): { votes: number; pp: number } {
  return {
    votes: r.lula - r.bolsonaro,
    pp: r.valid > 0 ? Math.round(((r.lula - r.bolsonaro) / r.valid) * 10000) / 100 : 0,
  };
}

export function buildEntry(
  key: PresidentialCandidateKey,
  r1_2022: PresVotes | null,
  r2_2022: PresVotes | null,
  v2026: number | null,
  valid2026: number | null,
): PresidentialComparisonEntry {
  const c = CANDIDATES[key];
  const v22r1 = r1_2022 ? r1_2022[key] : null;
  const v22r2 = r2_2022 ? r2_2022[key] : null;
  const s22r1 = share(v22r1, r1_2022?.valid ?? null);
  const s26 = share(v2026, valid2026);
  return {
    key,
    ballot_name_2022: c.name_2022,
    ballot_name_2026: c.name_2026,
    number_2022: c.number_2022,
    number_2026: c.number_2026,
    votes_2022_r1: v22r1,
    valid_2022_r1: r1_2022 ? r1_2022.valid : null,
    share_2022_r1: s22r1,
    votes_2022_r2: v22r2,
    valid_2022_r2: r2_2022 ? r2_2022.valid : null,
    share_2022_r2: share(v22r2, r2_2022?.valid ?? null),
    votes_2026_r1: v2026,
    valid_2026_r1: valid2026,
    share_2026_r1: s26,
    delta_pp_r1: deltaPp(s26, s22r1),
    delta_votes_r1: v22r1 !== null && v2026 !== null ? v2026 - v22r1 : null,
  };
}

// ---------- polling place matching (2022 local → 2026 neighborhood) ----------

export interface Place2026 {
  neighborhood_id: string;
  lat: number | null;
  lon: number | null;
}
export type MatchMethod = 'same_place' | 'bairro_name' | 'none';
export interface MatchResult {
  neighborhood_id: string | null;
  method: MatchMethod;
  /** an (a) hit was rejected because the 2026 place with the same number is far away */
  rejected_far: boolean;
}

/** Key of a polling place: TSE municipality code (no leading zeros), zone, place number. */
export const localKey = (cdMun: string | number, zona: number, local: number) =>
  `${Number(cdMun)}|${zona}|${local}`;

/** Haversine distance in metres. */
export function distanceM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Distance above which a same-number polling place is treated as a different building. */
export const SAME_PLACE_MAX_M = 1000;

/**
 * (a) same municipality + same zone + same polling-place number in the 2026 extract → that place's
 *     neighborhood (rejected when both have coordinates more than SAME_PLACE_MAX_M apart);
 * (b) otherwise the 2022 address neighborhood (NM_BAIRRO) slugified → `mg-<ibge>-<slug>` if it exists;
 * (c) otherwise unmatched (discarded and counted).
 */
export function matchLocal(
  l: Pick<Local2022, 'cd_municipio' | 'zona' | 'local' | 'bairro' | 'lat' | 'lon'>,
  ibge: string,
  places2026: Map<string, Place2026>,
  neighborhoodIds: Set<string>,
): MatchResult {
  const hit = places2026.get(localKey(l.cd_municipio, l.zona, l.local));
  let rejected = false;
  if (hit) {
    const far =
      l.lat !== null &&
      l.lon !== null &&
      hit.lat !== null &&
      hit.lon !== null &&
      distanceM(l.lat, l.lon, hit.lat, hit.lon) > SAME_PLACE_MAX_M;
    if (!far)
      return { neighborhood_id: hit.neighborhood_id, method: 'same_place', rejected_far: false };
    rejected = true;
  }
  const slug = slugify(l.bairro);
  if (slug) {
    const id = `mg-${ibge}-${slug}`;
    if (neighborhoodIds.has(id))
      return { neighborhood_id: id, method: 'bairro_name', rejected_far: rejected };
  }
  return { neighborhood_id: null, method: 'none', rejected_far: rejected };
}

/** Below this share of 2022 valid votes (r1) matched, a municipality's neighborhoods get 'unavailable'. */
export const MIN_MATCH_RATE = 0.8;

export function matchRate(matchedValid: number, totalValid: number): number {
  return totalValid > 0 ? matchedValid / totalValid : 0;
}

/** Symmetric domain for a diverging (pp) layer. */
export function symmetricDomain(values: number[]): [number, number] {
  const m = values.reduce((a, v) => Math.max(a, Math.abs(v)), 0);
  const r = Math.round(m * 10000) / 10000;
  return [-r, r];
}

/** 1-based rank of `uf` among UFs by eligible voters (descending), excluding the exterior ('ZZ'). */
export function ufRank(byUf: Record<string, { eligible: number }>, uf: string): number {
  const sorted = Object.entries(byUf)
    .filter(([k]) => k !== 'ZZ')
    .sort((a, b) => b[1].eligible - a[1].eligible);
  return sorted.findIndex(([k]) => k === uf) + 1;
}
