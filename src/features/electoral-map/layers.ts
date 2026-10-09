/**
 * Map layer metadata: labels, units, denominators and value extraction. Kept
 * pure so legends, lists and the map paint from the same definitions.
 *
 * Rodada 3 (owner decisions 2026-10-09):
 * - statistical layers are exclusive (one choropleth at a time): abstention, turnout,
 *   votes and the presidential 2022 → 2026 comparison (Lula / Bolsonaro);
 * - activities and points of interest are OVERLAYS (switches), never a choropleth;
 * - the tracked-candidate layer `comparison` left the selector and the legend; it is kept
 *   here only so old files/links do not break (legacy `?camada=comparacao` opens the
 *   presidential comparison instead).
 */
import type {
  MapLayerCode,
  PresidentialCandidateKey,
  TerritoryMetrics,
} from '@shared/contracts/metrics.ts';
import { formatPercent, formatPp } from '@/lib/format';

export interface LayerMeta {
  code: MapLayerCode;
  label: string;
  short: string;
  unit: string;
  denominator: string;
  scale: 'sequential' | 'diverging' | 'none';
  /** Needs a sub-selection: candidate id (votes) or 'lula' | 'bolsonaro' (president_comparison). */
  needsCandidate: boolean;
  /** Source shown in the legend. */
  source?: string;
  /**
   * Colour scheme of a diverging layer. 'partisan' is the ONLY exception to the neutral-colour
   * rule (owner decision D25): red = Lula margin, blue = Bolsonaro margin, president_margin only.
   */
  palette?: 'neutral' | 'partisan';
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
    // Legacy (rodada 2): kept only for old snapshot files; not offered in the UI.
    code: 'comparison',
    label: '2022 × 2026',
    short: '2022 × 2026',
    unit: 'pontos percentuais (p.p.)',
    denominator: 'participação nos válidos 2026 − participação nos válidos 2022',
    scale: 'diverging',
    needsCandidate: true,
  },
  president_comparison: {
    code: 'president_comparison',
    label: 'Lula × Bolsonaro',
    short: '2022 → 2026',
    unit: 'pontos percentuais (p.p.)',
    denominator: '% dos válidos no 1º turno de 2026 − % dos válidos no 1º turno de 2022',
    scale: 'diverging',
    needsCandidate: true,
    source: 'TSE (dados abertos de 2022) e snapshot de 2026',
  },
  president_margin: {
    code: 'president_margin',
    label: 'Lula × Bolsonaro (margem)',
    short: 'Margem',
    unit: 'margem em p.p. dos votos válidos',
    denominator:
      '% dos válidos de Lula − % dos válidos de Bolsonaro (Presidente, no turno escolhido)',
    scale: 'diverging',
    palette: 'partisan',
    needsCandidate: false,
    source: 'TSE (dados abertos de 2022; extrato de 2026)',
  },
  mobilization: {
    // D27: derived in the browser from abstention + margin (2026 r1); no new file.
    code: 'mobilization',
    label: 'Mobilização: abstenção onde Lula liderou',
    short: 'Mobilização',
    unit: '% do eleitorado apto que não votou',
    denominator:
      'abstenções ÷ eleitorado apto, apenas em territórios onde Lula liderou no 1º turno de 2026',
    scale: 'sequential',
    needsCandidate: true,
    source: 'TSE (extrato de 2026)',
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
  pois: {
    code: 'pois',
    label: 'Terminais e estações',
    short: 'Terminais',
    unit: 'locais de grande circulação (OpenStreetMap)',
    denominator: 'pontos de interesse, não dados eleitorais',
    scale: 'none',
    needsCandidate: false,
    source: '© OpenStreetMap contributors (ODbL)',
  },
};

/** Exclusive statistical layers offered in the selector (rodada 3). */
export type StatLayerCode =
  'abstention' | 'turnout' | 'votes' | 'president_comparison' | 'president_margin' | 'mobilization';
export const LAYER_ORDER: StatLayerCode[] = [
  'abstention',
  'turnout',
  'votes',
  'president_margin',
  'president_comparison',
  'mobilization',
];

/** Layers whose year/round is fixed to the 2026 1st round (or to their own sub-selection). */
export function isFixedRoundLayer(code: MapLayerCode): boolean {
  return (
    code === 'comparison' ||
    code === 'president_comparison' ||
    code === 'president_margin' ||
    code === 'mobilization'
  );
}

/** Year/round options of the margin layer (files produced by the data pipeline). */
export const MARGIN_ROUNDS = [
  { year: 2026, round: 1, label: '2026 · 1º turno' },
  { year: 2022, round: 2, label: '2022 · 2º turno' },
  { year: 2022, round: 1, label: '2022 · 1º turno' },
] as const;

export function marginRoundOf(year: number, round: number) {
  return MARGIN_ROUNDS.find((r) => r.year === year && r.round === round) ?? MARGIN_ROUNDS[0];
}

export function isStatLayer(code: MapLayerCode): code is StatLayerCode {
  return (LAYER_ORDER as MapLayerCode[]).includes(code);
}

/** URL slug (pt-BR) ↔ layer code. */
export const LAYER_SLUG: Record<MapLayerCode, string> = {
  abstention: 'abstencao',
  turnout: 'comparecimento',
  votes: 'votacao',
  comparison: 'comparacao',
  president_comparison: 'lula-bolsonaro',
  president_margin: 'margem',
  mobilization: 'mobilizacao',
  activities: 'atividades',
  pois: 'terminais',
};

/** Legacy slugs that no longer name a selectable layer. */
const LEGACY_SLUG: Record<string, StatLayerCode> = {
  comparacao: 'president_comparison',
  comparison: 'president_comparison',
};

/**
 * Statistical layer for a URL slug. Overlay slugs (`atividades`, `terminais`) and unknown
 * values return null (caller uses the default); the retired tracked-candidate comparison
 * maps to the presidential comparison.
 */
export function layerFromSlug(slug: string | null): StatLayerCode | null {
  if (!slug) return null;
  const legacy = LEGACY_SLUG[slug];
  if (legacy) return legacy;
  const hit = (Object.entries(LAYER_SLUG) as [MapLayerCode, string][]).find(([, s]) => s === slug);
  const code = hit ? hit[0] : (slug as MapLayerCode);
  return isStatLayer(code) ? code : null;
}

/** Presidential sub-selection (Lula / Bolsonaro). */
export const PRESIDENT_KEYS: PresidentialCandidateKey[] = ['lula', 'bolsonaro'];
export const PRESIDENT_LABEL: Record<PresidentialCandidateKey, string> = {
  lula: 'Lula',
  bolsonaro: 'Bolsonaro',
};
/** Long label: the Bolsonaro entry is Jair in 2022 and Flávio in 2026. */
export const PRESIDENT_LONG_LABEL: Record<PresidentialCandidateKey, string> = {
  lula: 'Lula (2022 e 2026)',
  bolsonaro: 'Bolsonaro (Jair em 2022, Flávio em 2026)',
};

export function isPresidentKey(v: string | null | undefined): v is PresidentialCandidateKey {
  return v === 'lula' || v === 'bolsonaro';
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
    case 'president_margin':
      return marginFromComparison(m.president_comparison, m.year, m.round);
    case 'mobilization': {
      // Abstention rate only where the chosen side led (default: Lula) in 2026 r1.
      if (m.year !== 2026 || m.round !== 1 || !m.turnout) return null;
      const margin = marginFromComparison(m.president_comparison, 2026, 1);
      if (margin === null) return null;
      const side = candidateId === 'bolsonaro' ? 'bolsonaro' : 'lula';
      return (side === 'lula' ? margin > 0 : margin < 0) ? m.turnout.abstention_rate : null;
    }
    case 'president_comparison': {
      if (!isPresidentKey(candidateId)) return null;
      const pc = m.president_comparison;
      if (!pc || pc.precision === 'unavailable') return null;
      return pc.entries.find((e) => e.key === candidateId)?.delta_pp_r1 ?? null;
    }
    default:
      return null;
  }
}

export function formatLayerValue(layer: MapLayerCode, v: number | null | undefined): string {
  if (v === null || v === undefined)
    return layer === 'mobilization' ? 'fora do recorte ou sem dado' : 'sem dado';
  if (layer === 'comparison' || layer === 'president_comparison' || layer === 'president_margin')
    return formatPp(v);
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

/** Presidential comparison of a territory (carried by the 2026 1st-round row), if any. */
export function pickPresidentComparison(list: TerritoryMetrics[] | undefined) {
  const row =
    list?.find((m) => m.year === 2026 && m.round === 1 && m.president_comparison) ??
    list?.find((m) => m.president_comparison);
  return row?.president_comparison ?? null;
}

/**
 * Lula − Bolsonaro margin (p.p. of valid votes) for a year/round, from a presidential
 * comparison block (used for neighborhoods, which have no margin layer file).
 */
export function marginFromComparison(
  pc: TerritoryMetrics['president_comparison'] | null | undefined,
  year: number,
  round: number,
): number | null {
  if (!pc || pc.precision === 'unavailable') return null;
  const field =
    year === 2026 && round === 1
      ? 'share_2026_r1'
      : year === 2022 && round === 1
        ? 'share_2022_r1'
        : year === 2022 && round === 2
          ? 'share_2022_r2'
          : null;
  if (!field) return null;
  const l = pc.entries.find((e) => e.key === 'lula')?.[field];
  const b = pc.entries.find((e) => e.key === 'bolsonaro')?.[field];
  if (l === null || l === undefined || b === null || b === undefined) return null;
  return Math.round((l - b) * 10000) / 100;
}
