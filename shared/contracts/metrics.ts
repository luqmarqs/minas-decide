/**
 * Electoral metrics contracts (spec §4.3, §4.12). Values come ONLY from a
 * validated public snapshot (status validated|partial) or a labelled demo
 * fixture (status demo). Never from the legacy database at runtime.
 */
import { z } from 'zod';
import { TerritoryId } from './territory.ts';

export const SnapshotStatus = z.enum(['validated', 'partial', 'demo']);
export type SnapshotStatus = z.infer<typeof SnapshotStatus>;

export const OfficeCode = z.enum([
  'president',
  'governor',
  'senator',
  'federal_deputy',
  'state_deputy',
]);
export type OfficeCode = z.infer<typeof OfficeCode>;

export const OFFICE_LABEL_PT: Record<OfficeCode, string> = {
  president: 'Presidente',
  governor: 'Governador(a)',
  senator: 'Senador(a)',
  federal_deputy: 'Deputado(a) Federal',
  state_deputy: 'Deputado(a) Estadual',
};

/** Number of votes each voter casts for the office (2026: 2 senate seats). */
export const VOTES_PER_VOTER: Record<OfficeCode, number> = {
  president: 1,
  governor: 1,
  senator: 2,
  federal_deputy: 1,
  state_deputy: 1,
};

/** Turnout block for one territory, year, round. */
export const TurnoutMetrics = z.object({
  eligible: z.number().int().nonnegative(), // aptos
  turnout: z.number().int().nonnegative(), // comparecimento
  abstention: z.number().int().nonnegative(), // aptos - comparecimento
  abstention_rate: z.number().min(0).max(1), // abstention / eligible
  turnout_rate: z.number().min(0).max(1),
  valid: z.number().int().nonnegative(),
  blank: z.number().int().nonnegative(),
  null_votes: z.number().int().nonnegative(),
  /** Which office's totals row the valid/blank/null values came from */
  basis_office: OfficeCode,
});
export type TurnoutMetrics = z.infer<typeof TurnoutMetrics>;

export const CandidateResult = z.object({
  candidate_id: z.string(),
  ballot_name: z.string(),
  party: z.string(),
  number: z.number().int(),
  office: OfficeCode,
  votes: z.number().int().nonnegative(),
  /** votes / valid votes of that office in this territory */
  share_of_valid: z.number().min(0).max(1),
  /** true when the snapshot also contains 2022 history for this candidate */
  has_history: z.boolean().default(false),
});
export type CandidateResult = z.infer<typeof CandidateResult>;

export const ComparisonPoint = z.object({
  candidate_id: z.string(),
  ballot_name: z.string(),
  party: z.string(),
  office: OfficeCode,
  votes_2022: z.number().int().nonnegative().nullable(),
  valid_2022: z.number().int().nonnegative().nullable(),
  votes_2026: z.number().int().nonnegative().nullable(),
  valid_2026: z.number().int().nonnegative().nullable(),
  delta_votes: z.number().int().nullable(),
  /** percentage points of share_of_valid (2026 − 2022) */
  delta_pp: z.number().nullable(),
  note: z.string().nullable(),
});
export type ComparisonPoint = z.infer<typeof ComparisonPoint>;

/** Presidential head-to-head used for the 2022 → 2026 comparison (owner decision, rodada 3).
 *  2022 figures come from TSE open data (municipality level; neighborhood level is an
 *  approximation when polling places could be matched). */
export const PresidentialCandidateKey = z.enum(['lula', 'bolsonaro']);
export type PresidentialCandidateKey = z.infer<typeof PresidentialCandidateKey>;

export const PresidentialComparisonEntry = z.object({
  key: PresidentialCandidateKey,
  ballot_name_2022: z.string(),
  ballot_name_2026: z.string(),
  number_2022: z.number().int(),
  number_2026: z.number().int(),
  votes_2022_r1: z.number().int().nonnegative().nullable(),
  valid_2022_r1: z.number().int().nonnegative().nullable(),
  share_2022_r1: z.number().min(0).max(1).nullable(),
  votes_2022_r2: z.number().int().nonnegative().nullable(),
  valid_2022_r2: z.number().int().nonnegative().nullable(),
  share_2022_r2: z.number().min(0).max(1).nullable(),
  votes_2026_r1: z.number().int().nonnegative().nullable(),
  valid_2026_r1: z.number().int().nonnegative().nullable(),
  share_2026_r1: z.number().min(0).max(1).nullable(),
  /** percentage points, share_2026_r1 − share_2022_r1 */
  delta_pp_r1: z.number().nullable(),
  delta_votes_r1: z.number().int().nullable(),
});
export type PresidentialComparisonEntry = z.infer<typeof PresidentialComparisonEntry>;

export const PresidentialComparison = z.object({
  /** 'exact' (municipality/state) or 'approximate' (neighborhood matched by polling place) or 'unavailable' */
  precision: z.enum(['exact', 'approximate', 'unavailable']),
  entries: z.array(PresidentialComparisonEntry),
  note: z.string().nullable(),
});
export type PresidentialComparison = z.infer<typeof PresidentialComparison>;

export const TerritoryMetrics = z.object({
  territory_id: TerritoryId,
  year: z.number().int(),
  round: z.number().int().min(1).max(2),
  status: SnapshotStatus,
  release_id: z.string(),
  data_quality: z.enum(['complete', 'incomplete', 'approximate', 'unavailable', 'demo']),
  turnout: TurnoutMetrics.nullable(),
  /** per office: top candidates (majoritarian: all; proportional: top N + tracked) */
  results: z.partialRecord(OfficeCode, z.array(CandidateResult)),
  valid_by_office: z.partialRecord(OfficeCode, z.number().int().nonnegative()),
  /** @deprecated kept empty since rodada 3 (tracked-candidate history is no longer highlighted) */
  comparison_2022: z.array(ComparisonPoint),
  president_comparison: PresidentialComparison.nullable().optional(),
  warnings: z.array(z.string()),
});
export type TerritoryMetrics = z.infer<typeof TerritoryMetrics>;

/** Map layer codes (spec §12.3). */
export const MapLayerCode = z.enum([
  'abstention',
  'turnout',
  'votes',
  'comparison',
  'president_comparison',
  /** narrative layer: Lula share − Bolsonaro share (p.p.) per territory, for a given year/round */
  'president_margin',
  'activities',
  'pois',
]);
export type MapLayerCode = z.infer<typeof MapLayerCode>;

/**
 * Compact file used to colour the map: one number per territory for a layer.
 * `values` maps territory_id → value (rate 0..1 for abstention/turnout,
 * share_of_valid for votes, delta_pp for comparison). Missing = no data.
 */
export const MapLayerValues = z.object({
  layer: MapLayerCode,
  year: z.number().int(),
  round: z.number().int(),
  unit: z.enum(['rate', 'share', 'pp']),
  /** candidate id (votes layer) or 'lula' | 'bolsonaro' (president_comparison layer) */
  candidate_id: z.string().nullable(),
  values: z.record(z.string(), z.number()),
  domain: z.tuple([z.number(), z.number()]),
});
export type MapLayerValues = z.infer<typeof MapLayerValues>;

export const SnapshotFile = z.object({
  path: z.string(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  bytes: z.number().int().nonnegative(),
});

export const SnapshotManifest = z.object({
  schema_version: z.literal(1),
  release_id: z.string(),
  status: SnapshotStatus,
  generated_at: z.string(),
  years: z.array(z.number().int()),
  rounds: z.array(z.number().int()),
  geographic_levels: z.array(z.enum(['state', 'municipality', 'neighborhood'])),
  source_project_alias: z.string(),
  source_tables: z.array(z.string()),
  pipeline_commit: z.string(),
  territories_count: z.number().int().nonnegative(),
  records_count: z.number().int().nonnegative(),
  indicator_types: z.array(z.string()),
  files: z.array(SnapshotFile),
  methodology_version: z.string(),
  coverage_notes: z.array(z.string()),
  warnings: z.array(z.string()),
});
export type SnapshotManifest = z.infer<typeof SnapshotManifest>;
