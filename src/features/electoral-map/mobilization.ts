/**
 * Mobilization view (owner decision D27): abstention rate highlighted only in the
 * territories where Lula (default) — or, as an optional sub-selection, Bolsonaro — led the
 * 2026 1st round. Pure functions, derived from data already published (abstention layer +
 * margin layer for municipalities; turnout + presidential comparison for neighborhoods).
 * Aggregated territorial prioritization of turnout — never an inference about people.
 */
import type { MapLayerValues, TerritoryMetrics } from '@shared/contracts/metrics.ts';
import { marginFromComparison, pickMetrics, pickPresidentComparison } from './layers';

export type MobilizationSide = 'lula' | 'bolsonaro';

export const MOBILIZATION_SIDE_LABEL: Record<MobilizationSide, string> = {
  lula: 'Onde Lula liderou',
  bolsonaro: 'Onde Bolsonaro liderou',
};

export function sideOf(candidateId: string | null | undefined): MobilizationSide {
  return candidateId === 'bolsonaro' ? 'bolsonaro' : 'lula';
}

/** true when the margin (p.p., + = Lula) puts the territory on the chosen side. */
export function ledBy(margin: number | null | undefined, side: MobilizationSide): boolean {
  if (margin === null || margin === undefined || !Number.isFinite(margin)) return false;
  return side === 'lula' ? margin > 0 : margin < 0;
}

/**
 * Municipality layer: abstention rate where the side led, absent elsewhere (painted as
 * "fora do recorte"). Domain = min/max of the abstention rates inside the cut.
 */
export function deriveMobilizationLayer(
  abstention: MapLayerValues | null | undefined,
  margin: MapLayerValues | null | undefined,
  side: MobilizationSide,
): MapLayerValues | null {
  if (!abstention || !margin) return null;
  const values: Record<string, number> = {};
  for (const [id, rate] of Object.entries(abstention.values)) {
    if (ledBy(margin.values[id], side)) values[id] = rate;
  }
  const list = Object.values(values);
  const domain: [number, number] = list.length ? [Math.min(...list), Math.max(...list)] : [0, 1];
  return {
    layer: 'mobilization',
    year: 2026,
    round: 1,
    unit: 'rate',
    candidate_id: side,
    values,
    domain,
  };
}

export interface MobilizationRow {
  id: string;
  name: string;
  /** abstention ÷ eligible (0..1) */
  rate: number;
  /** absolute abstentions, when known */
  abstention: number | null;
  /** blank + null votes (President), when known (D30) */
  blankNull?: number | null;
  /** (blank + null) ÷ turnout, when known */
  blankNullRate?: number | null;
  /** Lula − Bolsonaro, p.p. of valid votes (2026 r1) */
  margin: number;
}

/** Neighborhood (or any territory with a metrics file) row, or null when out of the cut. */
export function rowFromMetrics(
  id: string,
  name: string,
  rows: TerritoryMetrics[] | undefined,
  side: MobilizationSide,
): MobilizationRow | null {
  const m = pickMetrics(rows, 2026, 1);
  const margin = marginFromComparison(pickPresidentComparison(rows), 2026, 1);
  if (!m?.turnout || margin === null || !ledBy(margin, side)) return null;
  return {
    id,
    name,
    rate: m.turnout.abstention_rate,
    abstention: m.turnout.abstention,
    blankNull: m.turnout.blank + m.turnout.null_votes,
    blankNullRate:
      m.turnout.turnout > 0 ? (m.turnout.blank + m.turnout.null_votes) / m.turnout.turnout : null,
    margin,
  };
}

/** Municipality rows from the two layer files (no absolute abstentions there). */
export function rowsFromLayers(
  abstention: MapLayerValues | null | undefined,
  margin: MapLayerValues | null | undefined,
  names: Map<string, string>,
  side: MobilizationSide,
  blankNull?: MapLayerValues | null,
): MobilizationRow[] {
  if (!abstention || !margin) return [];
  const out: MobilizationRow[] = [];
  for (const [id, rate] of Object.entries(abstention.values)) {
    const mg = margin.values[id];
    if (mg === undefined || !ledBy(mg, side)) continue;
    out.push({
      id,
      name: names.get(id) ?? id,
      rate,
      abstention: null,
      margin: mg,
      blankNull: null,
      blankNullRate: blankNull?.values[id] ?? null,
    });
  }
  return out;
}

export interface MobilizationRanking {
  top: MobilizationRow[];
  /** territories inside the cut */
  count: number;
  /** sum of absolute abstentions of the top rows (null if any is unknown) */
  totalTop: number | null;
  /** sum over every territory in the cut (null if any is unknown) */
  totalAll: number | null;
  /** blank + null votes summed over the top rows / every row (null if any is unknown) */
  blankNullTop: number | null;
  blankNullAll: number | null;
}

const sum = (rows: MobilizationRow[]) =>
  rows.every((r) => r.abstention !== null)
    ? rows.reduce((a, r) => a + (r.abstention ?? 0), 0)
    : null;
const sumBlankNull = (rows: MobilizationRow[]) =>
  rows.length && rows.every((r) => r.blankNull !== null && r.blankNull !== undefined)
    ? rows.reduce((a, r) => a + (r.blankNull ?? 0), 0)
    : null;

/** "abstenção + brancos e nulos" (sum of two distinct groups), null if either is unknown. */
export function combinedTotal(abstention: number | null, blankNull: number | null) {
  return abstention === null || blankNull === null ? null : abstention + blankNull;
}

/** Highest abstention rate first (ties: more abstentions, then name). */
export function rankMobilization(rows: MobilizationRow[], n = 10): MobilizationRanking {
  const collator = new Intl.Collator('pt-BR');
  const sorted = [...rows].sort(
    (a, b) =>
      b.rate - a.rate ||
      (b.abstention ?? 0) - (a.abstention ?? 0) ||
      collator.compare(a.name, b.name),
  );
  const top = sorted.slice(0, n);
  return {
    top,
    count: rows.length,
    totalTop: sum(top),
    totalAll: sum(rows),
    blankNullTop: sumBlankNull(top),
    blankNullAll: sumBlankNull(rows),
  };
}
