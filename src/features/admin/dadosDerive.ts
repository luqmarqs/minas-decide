import { formatInt } from '@/lib/format';

/** Pure derivations for the Dados section (kept apart from the components for tests / fast refresh). */

export interface LayerSummary {
  /** `2026 · 1º turno` */
  election: string;
  layers: string[];
}

const LAYER_LABEL: Record<string, string> = {
  turnout: 'comparecimento',
  abstention: 'abstenção',
  blank_null: 'brancos e nulos',
  president_margin: 'margem presidencial',
  president_comparison: 'comparação 2022→2026',
};

/** Layers published, read from the paths the manifest already lists (no folder listing). */
export function summarizeLayers(files: { path: string }[]): LayerSummary[] {
  const byElection = new Map<string, Map<string, number>>();
  for (const f of files) {
    const m = /\/layers\/(\d{4})-r(\d+)-([a-z_]+)(?:-[^/]+)?\.json$/.exec(f.path);
    if (!m) continue;
    const key = `${m[1]} · ${m[2]}º turno`;
    const layers = byElection.get(key) ?? new Map<string, number>();
    layers.set(m[3]!, (layers.get(m[3]!) ?? 0) + 1);
    byElection.set(key, layers);
  }
  return [...byElection.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([election, layers]) => ({
      election,
      layers: [...layers.entries()].map(([name, n]) =>
        name === 'votes'
          ? `votos por candidatura (${formatInt(n)} arquivos)`
          : (LAYER_LABEL[name] ?? name),
      ),
    }));
}

/** Groups registered warnings by message, dropping the territory id and trailing details. */
export function groupWarnings(warnings: string[]): { key: string; label: string; count: number }[] {
  const groups = new Map<string, number>();
  for (const w of warnings) {
    const idx = w.indexOf(': ');
    const msg = (idx >= 0 ? w.slice(idx + 2) : w).replace(/\s*\([^)]*\)\.?\s*$/, '').trim();
    const label = msg.replace(/\.$/, '') || w;
    groups.set(label, (groups.get(label) ?? 0) + 1);
  }
  return [...groups.entries()]
    .map(([label, count]) => ({ key: label, label, count }))
    .sort((a, b) => b.count - a.count);
}

/** 2022 matching figures live only in the free-text coverage notes; absent -> null. */
export function parseMatching(notes: string[]): {
  matchedPct: number | null;
  lowMunicipalities: number | null;
} {
  const text = notes.join(' ');
  const pct = /(\d+(?:[.,]\d+)?)\s*% dos votos válidos de 2022/.exec(text);
  const low = /(\d+)\s+municípios abaixo de 80\s*%/.exec(text);
  return {
    matchedPct: pct ? Number(pct[1]!.replace(',', '.')) : null,
    lowMunicipalities: low ? Number(low[1]) : null,
  };
}

const SHORT_SOURCES: [RegExp, string][] = [
  [/TSE/i, 'TSE'],
  [/IBGE/i, 'IBGE'],
  [/OpenStreetMap|OSM/i, 'OpenStreetMap'],
];

export function shortSources(texts: string[]): string[] {
  const out: string[] = [];
  for (const [re, name] of SHORT_SOURCES) if (texts.some((t) => re.test(t))) out.push(name);
  return out;
}

export const QUALITY_LABEL: Record<string, string> = {
  complete: 'completo',
  incomplete: 'incompleto',
  estimated: 'estimado',
  approximate: 'aproximado',
  unavailable: 'indisponível (sem dados ou sem comparação)',
  demo: 'demonstrativo',
};

export const POI_LABEL: Record<string, string> = {
  bus_terminal: 'Terminais de ônibus',
  bus_station: 'Estações de ônibus',
  metro_station: 'Estações de metrô',
  market: 'Mercados',
  other: 'Outros',
};
