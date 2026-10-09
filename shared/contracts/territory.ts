/**
 * Territory contracts. Territories are MG → municipality → neighborhood.
 * Neighborhood ("bairro") is derived from polling-place addresses (spec §4.4):
 * it is a methodological approximation, never an official TSE unit.
 *
 * Territory ids are stable, URL-safe strings:
 *   "mg"                      state
 *   "mg-3140001"              municipality (IBGE 7-digit code)
 *   "mg-3140001-centro"       neighborhood (slug of the polling-place bairro)
 */
import { z } from 'zod';

export const TerritoryType = z.enum(['state', 'municipality', 'neighborhood']);
export type TerritoryType = z.infer<typeof TerritoryType>;

export const DataQuality = z.enum([
  'complete',
  'incomplete',
  'estimated',
  'approximate',
  'unavailable',
  'demo',
]);
export type DataQuality = z.infer<typeof DataQuality>;

export const TerritoryId = z
  .string()
  .regex(/^mg(-\d{7})?(-[a-z0-9]+(?:-[a-z0-9]+)*)?$/, 'territory_id inválido');

export const TerritorySummary = z.object({
  id: TerritoryId,
  type: TerritoryType,
  name: z.string(),
  slug: z.string(),
  parent_id: TerritoryId.nullable(),
  ibge_code: z.string().nullable(),
  state_code: z.literal('MG'),
  /** [lon, lat] */
  centroid: z.tuple([z.number(), z.number()]).nullable(),
  data_quality: DataQuality,
  polling_places: z.number().int().nonnegative().optional(),
});
export type TerritorySummary = z.infer<typeof TerritorySummary>;

export const TerritorySearchItem = TerritorySummary.pick({
  id: true,
  type: true,
  name: true,
  slug: true,
}).extend({
  /** Disambiguation label, e.g. "Centro — Mariana/MG" */
  label: z.string(),
  municipality_name: z.string().nullable(),
});
export type TerritorySearchItem = z.infer<typeof TerritorySearchItem>;

export const TerritorySearchResponse = z.object({ items: z.array(TerritorySearchItem) });

export const TerritoryDetail = TerritorySummary.extend({
  breadcrumb: z.array(TerritorySummary.pick({ id: true, type: true, name: true, slug: true })),
  children_count: z.number().int().nonnegative(),
  coverage_note: z.string().nullable(),
});
export type TerritoryDetail = z.infer<typeof TerritoryDetail>;

/** Entry of the static territories index shipped with the snapshot. */
export const TerritoryIndexEntry = TerritorySummary.extend({
  normalized_name: z.string(),
  municipality_name: z.string().nullable(),
});
export type TerritoryIndexEntry = z.infer<typeof TerritoryIndexEntry>;
