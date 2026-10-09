/**
 * Map layer metadata: labels, units, denominators and value extraction. Kept
 * pure so legends, lists and the map paint from the same definitions.
 */
import type { MapLayerCode, TerritoryMetrics } from '@shared/contracts/metrics.ts';
import { formatPercent, formatPp } from '@/lib/format';

export interface LayerMeta {
  code: MapLayerCode;
  label: string;
  short: string;
  unit: string;
  denominator: string;
  scale: 'sequential' | 'diverging' | 'none';
  needsCandidate: boolean;
}

export const LAYERS: Record<MapLayerCode, LayerMeta> = {
  abstention: {
    code: 'abstention',
    label: 'Abstenção',
    short: 'Abstenção',
    unit: '% do eleitorado apto',
    denominator: 'abstenções ÷ eleitorado apto',
    scale: 'sequential',
    needsCandidate: false,
  },
  turnout: {
    code: 'turnout',
    label: 'Comparecimento',
    short: 'Comparecimento',
    unit: '% do eleitorado apto',
    denominator: 'comparecimento ÷ eleitorado apto',
    scale: 'sequential',
    needsCandidate: false,
  },
  votes: {
    code: 'votes',
    label: 'Votação',
    short: 'Votação',
    unit: '% dos votos válidos do cargo',
    denominator: 'votos da candidatura ÷ votos válidos do cargo',
    scale: 'sequential',
    needsCandidate: true,
  },
  comparison: {
    code: 'comparison',
    label: '2022 × 2026',
    short: '2022 × 2026',
    unit: 'pontos percentuais (p.p.)',
    denominator: 'participação nos válidos 2026 − participação nos válidos 2022',
    scale: 'diverging',
    needsCandidate: true,
  },
  activities: {
    code: 'activities',
    label: 'Atividades',
    short: 'Atividades',
    unit: 'atividades publicadas',
    denominator: 'agenda pública aprovada',
    scale: 'none',
    needsCandidate: false,
  },
};

export const LAYER_ORDER: MapLayerCode[] = [
  'abstention',
  'turnout',
  'votes',
  'comparison',
  'activities',
];

/** URL slug (pt-BR) ↔ layer code. */
export const LAYER_SLUG: Record<MapLayerCode, string> = {
  abstention: 'abstencao',
  turnout: 'comparecimento',
  votes: 'votacao',
  comparison: 'comparacao',
  activities: 'atividades',
};

export function layerFromSlug(slug: string | null): MapLayerCode | null {
  if (!slug) return null;
  const hit = (Object.entries(LAYER_SLUG) as [MapLayerCode, string][]).find(([, s]) => s === slug);
  if (hit) return hit[0];
  return (LAYER_ORDER as string[]).includes(slug) ? (slug as MapLayerCode) : null;
}

/** Value used to colour a territory for a layer (rates 0..1, share 0..1, delta in p.p.). */
export function valueForLayer(
  m: TerritoryMetrics | undefined | null,
  layer: MapLayerCode,
  candidateId: string | null,
): number | null {
  if (!m) return null;
  switch (layer) {
    case 'abstention':
      return m.turnout ? m.turnout.abstention_rate : null;
    case 'turnout':
      return m.turnout ? m.turnout.turnout_rate : null;
    case 'votes': {
      if (!candidateId) return null;
      for (const list of Object.values(m.results)) {
        const hit = list?.find((c) => c.candidate_id === candidateId);
        if (hit) return hit.share_of_valid;
      }
      return null;
    }
    case 'comparison': {
      if (!candidateId) return null;
      const p = m.comparison_2022.find((c) => c.candidate_id === candidateId);
      return p?.delta_pp ?? null;
    }
    default:
      return null;
  }
}

export function formatLayerValue(layer: MapLayerCode, v: number | null | undefined): string {
  if (v === null || v === undefined) return 'sem dado';
  if (layer === 'comparison') return formatPp(v);
  return formatPercent(v);
}

/** Pick the metrics row for (year, round) from a list. */
export function pickMetrics(
  list: TerritoryMetrics[] | undefined,
  year: number,
  round: number,
): TerritoryMetrics | undefined {
  return list?.find((m) => m.year === year && m.round === round);
}
