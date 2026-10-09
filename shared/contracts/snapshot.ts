/**
 * Static electoral snapshot layout served from `public/data/` (spec §4.12).
 * The browser loads `manifest.json`, then files under `<release_id>/`.
 *
 *   public/data/manifest.json                      SnapshotManifest
 *   public/data/<release_id>/territories-index.json TerritoryIndexEntry[]
 *   public/data/<release_id>/methodology.json       Methodology
 *   public/data/<release_id>/layers/<year>-r<round>-<layer>.json          MapLayerValues
 *   public/data/<release_id>/layers/<year>-r<round>-votes-<candidate_id>.json
 *   public/data/<release_id>/metrics/mg.json                                MunicipalityMetricsFile (state level)
 *   public/data/<release_id>/metrics/mg-<ibge7>.json                        MunicipalityMetricsFile
 *   public/data/<release_id>/candidates.json                                CandidateIndex
 *   public/data/<release_id>/highlights.json                                Highlights
 *   public/data/pois/terminais-mg.json                                      PoiFile (OpenStreetMap, ODbL)
 *
 * No file may contain PII, project refs, or connection strings.
 */
import { z } from 'zod';
import { TerritoryId } from './territory.ts';
import { OfficeCode, TerritoryMetrics } from './metrics.ts';

export const SNAPSHOT_BASE_DEFAULT = '/data';

export const Methodology = z.object({
  version: z.string(),
  language: z.literal('pt-BR'),
  summary: z.string(),
  neighborhood_note: z.string(),
  comparison_note: z.string(),
  denominators: z.record(z.string(), z.string()),
  sources: z.array(z.object({ label: z.string(), note: z.string() })),
  limitations: z.array(z.string()),
});
export type Methodology = z.infer<typeof Methodology>;

export const CandidateIndexEntry = z.object({
  candidate_id: z.string(),
  ballot_name: z.string(),
  party: z.string(),
  number: z.number().int(),
  office: OfficeCode,
  year: z.number().int(),
  has_history: z.boolean(),
  /** true for majoritarian offices or tracked candidates: per-candidate map layer exists */
  has_layer: z.boolean(),
});
export const CandidateIndex = z.object({ items: z.array(CandidateIndexEntry) });
export type CandidateIndex = z.infer<typeof CandidateIndex>;

/** Key numbers for the home page cards ("por que Minas decide"). All values must
 *  carry a source; nothing here is typed by hand. */
export const HighlightItem = z.object({
  id: z.string(),
  label: z.string(),
  value: z.number(),
  unit: z.enum(['people', 'percent', 'pp', 'votes', 'count']),
  /** optional secondary number (e.g. national total, 2022 counterpart) */
  compare_value: z.number().nullable(),
  compare_label: z.string().nullable(),
  note: z.string().nullable(),
  source: z.string(),
});
export const Highlights = z.object({
  generated_at: z.string(),
  items: z.array(HighlightItem),
  why_minas: z.array(
    z.object({
      title: z.string(),
      text: z.string(),
      value: z.number().nullable(),
      unit: z.string().nullable(),
      source: z.string(),
    }),
  ),
});
export type Highlights = z.infer<typeof Highlights>;

/** Points of interest with high foot traffic (bus terminals etc.) from OpenStreetMap. */
export const PoiCategory = z.enum([
  'bus_terminal',
  'bus_station',
  'metro_station',
  'market',
  'other',
]);
export const PoiItem = z.object({
  id: z.string(),
  name: z.string(),
  category: PoiCategory,
  /** [lon, lat] */
  coordinates: z.tuple([z.number(), z.number()]),
  municipality_id: TerritoryId.nullable(),
  osm_url: z.string().url(),
});
export const PoiFile = z.object({
  generated_at: z.string(),
  source: z.string(),
  license: z.string(),
  attribution: z.string(),
  items: z.array(PoiItem),
});
export type PoiFile = z.infer<typeof PoiFile>;

export const MunicipalityMetricsFile = z.object({
  territory_id: TerritoryId,
  /** metrics of the municipality (or state) itself, one per (year, round) */
  self: z.array(TerritoryMetrics),
  /** neighborhoods keyed by territory_id, each one per (year, round) */
  children: z.record(z.string(), z.array(TerritoryMetrics)),
});
export type MunicipalityMetricsFile = z.infer<typeof MunicipalityMetricsFile>;

export function metricsFilePath(releaseId: string, municipalityId: string): string {
  return `${releaseId}/metrics/${municipalityId}.json`;
}

export function layerFilePath(
  releaseId: string,
  year: number,
  round: number,
  layer: string,
  candidateId?: string | null,
): string {
  const suffix = candidateId ? `-${candidateId}` : '';
  return `${releaseId}/layers/${year}-r${round}-${layer}${suffix}.json`;
}

/** Municipality id from any territory id. */
export function municipalityIdOf(territoryId: string): string | null {
  const m = /^(mg-\d{7})/.exec(territoryId);
  return m ? m[1]! : territoryId === 'mg' ? 'mg' : null;
}
