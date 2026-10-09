/**
 * DEMO electoral snapshot — 100% SYNTHETIC. Used only when `public/data/manifest.json`
 * is missing or invalid. Everything here is labelled `status: 'demo'` and the UI
 * shows "DADOS DEMONSTRATIVOS".
 *
 * - Municipality NAMES are invented ("Vale Demo", "Serra Exemplo"...). The 7-digit
 *   codes are borrowed from the IBGE municipal mesh only so the demo can colour real
 *   polygons; the name/number pairing is fictitious on purpose.
 * - Candidates are "Candidatura A/B/C" with party "PARTIDO DEMO" and impossible ballot
 *   numbers (9xx). No real person, party or vote count is represented.
 * - Counts are rounded to tens/hundreds so they read as synthetic.
 * - One municipality ("Ribeirão Fictício") has NO neighborhoods (spec T02) and the
 *   neighborhood "Centro" exists in several municipalities (spec T01).
 */
import { slugify, normalizeText } from '@shared/schemas/normalize.ts';
import type {
  CandidateResult,
  ComparisonPoint,
  MapLayerValues,
  OfficeCode,
  PresidentialComparison,
  PresidentialComparisonEntry,
  SnapshotManifest,
  TerritoryMetrics,
  TurnoutMetrics,
} from '@shared/contracts/metrics.ts';
import type { TerritoryIndexEntry } from '@shared/contracts/territory.ts';
import {
  layerFilePath,
  metricsFilePath,
  type CandidateIndex,
  type Highlights,
  type Methodology,
  type MunicipalityMetricsFile,
} from '@shared/contracts/snapshot.ts';

export const DEMO_RELEASE_ID = 'demo-sintetico-1';
const DEMO_GENERATED_AT = '2026-10-08T00:00:00.000Z';

interface DemoMunicipality {
  ibge: string;
  name: string;
  centroid: [number, number];
  bairros: string[];
}

export const DEMO_MUNICIPALITIES: readonly DemoMunicipality[] = [
  {
    ibge: '3100104',
    name: 'Vale Demo',
    centroid: [-47.4514, -18.3777],
    bairros: ['Centro', 'Jardim Exemplo', 'Vila Fictícia', 'Alto do Teste'],
  },
  {
    ibge: '3106655',
    name: 'Serra Exemplo',
    centroid: [-41.7528, -15.6964],
    bairros: ['Centro', 'Bela Vista Demo', 'Morada Simulada'],
  },
  { ibge: '3112901', name: 'Ribeirão Fictício', centroid: [-42.2522, -20.1889], bairros: [] },
  {
    ibge: '3119203',
    name: 'Campo Modelo',
    centroid: [-42.2647, -18.6052],
    bairros: ['Centro', 'São Amostra', 'Parque Ilustrativo', 'Vila Nova Demo', 'Jardim Protótipo'],
  },
  {
    ibge: '3125200',
    name: 'Lagoa Teste',
    centroid: [-45.8323, -21.4676],
    bairros: ['Centro', 'Lagoinha Demo', 'Recanto Exemplo'],
  },
  {
    ibge: '3130804',
    name: 'Morro Simulado',
    centroid: [-44.9388, -21.4121],
    bairros: ['Santa Fictícia', 'Vila Teste', 'Jardim Exemplo'],
  },
  {
    ibge: '3136801',
    name: 'Ponte Amostra',
    centroid: [-43.5656, -16.8474],
    bairros: ['Centro', 'Ponte Velha Demo', 'Bairro Hipotético', 'Alvorada Sintética'],
  },
  {
    ibge: '3142502',
    name: 'Rio Protótipo',
    centroid: [-44.0425, -18.3816],
    bairros: ['Beira-Rio Demo', 'Centro', 'Planalto Exemplo'],
  },
  {
    ibge: '3148004',
    name: 'Pedra Ilustrativa',
    centroid: [-46.4736, -18.6107],
    bairros: [
      'Centro',
      'Pedreira Demo',
      'Vila Modelo',
      'Cruzeiro Teste',
      'Boa Vista Fictícia',
      'Jardim Amostra',
    ],
  },
  {
    ibge: '3154150',
    name: 'Monte Hipotético',
    centroid: [-41.9373, -20.233],
    bairros: ['Centro', 'Alto Demo', 'Vila Exemplo'],
  },
  {
    ibge: '3160207',
    name: 'Porto Demonstração',
    centroid: [-43.2616, -18.4895],
    bairros: ['Porto Velho Demo', 'Centro', 'Ilha Fictícia', 'Jardim Teste'],
  },
  {
    ibge: '3166402',
    name: 'Vereda Sintética',
    centroid: [-44.4715, -21.9202],
    bairros: ['Centro', 'Buriti Demo', 'Vereda Alta Exemplo'],
  },
];

const STATE_CENTROID: [number, number] = [-44.6, -18.6];
const WARNING_MUNICIPALITY = '3125200';

interface DemoCandidate {
  id: string;
  name: string;
  number: number;
  office: OfficeCode;
  hasHistory: boolean;
}

function candidatesFor(office: OfficeCode, year: number, round: number): DemoCandidate[] {
  const base = office === 'president' ? 900 : office === 'governor' ? 910 : 920;
  const mk = (letter: string, offset: number, hasHistory: boolean): DemoCandidate => ({
    id: `demo-${office}-${letter.toLowerCase()}`,
    name: `Candidatura ${letter}`,
    number: base + offset,
    office,
    hasHistory,
  });
  if (year === 2022) return [mk('A', 1, true), mk('B', 2, true), mk('Z', 9, false)];
  if (round === 2) return [mk('A', 1, true), mk('B', 2, true)];
  return [mk('A', 1, true), mk('B', 2, true), mk('C', 3, false)];
}

const ROUNDS: { year: number; round: number; offices: OfficeCode[] }[] = [
  { year: 2026, round: 1, offices: ['president', 'governor', 'senator'] },
  { year: 2026, round: 2, offices: ['president', 'governor'] },
  { year: 2022, round: 1, offices: ['president', 'governor'] },
];

// ---------------------------------------------------------------------------
// Deterministic PRNG
function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function rng(seed: string): () => number {
  let a = hashString(seed);
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const round10 = (n: number) => Math.round(n / 10) * 10;
const round100 = (n: number) => Math.round(n / 100) * 100;

// ---------------------------------------------------------------------------
// Raw counts (summable) → TerritoryMetrics
interface Raw {
  eligible: number;
  turnout: number;
  blank: number;
  nullVotes: number;
  valid: number;
  /** office → valid votes for the office */
  validByOffice: Partial<Record<OfficeCode, number>>;
  /** office → candidate id → votes */
  votes: Partial<Record<OfficeCode, Record<string, number>>>;
}

function leafRaw(key: string, year: number, round: number, offices: OfficeCode[]): Raw {
  const r = rng(`${key}|base`); // eligible stable across years
  const eligible = 1000 * (3 + Math.floor(r() * 25));
  const r2 = rng(`${key}|${year}|${round}`);
  const turnoutRate = 0.66 + Math.round(r2() * 18) / 100;
  const turnout = round100(eligible * turnoutRate);
  const blank = round10(turnout * (0.02 + r2() * 0.02));
  const nullVotes = round10(turnout * (0.03 + r2() * 0.03));
  const valid = turnout - blank - nullVotes;
  const validByOffice: Raw['validByOffice'] = {};
  const votes: Raw['votes'] = {};
  for (const office of offices) {
    const officeValid = office === 'senator' ? 2 * valid - round10(valid * 0.12) : valid;
    validByOffice[office] = officeValid;
    const cands = candidatesFor(office, year, round);
    const weights = cands.map(() => 0.4 + r2());
    const total = weights.reduce((a, b) => a + b, 0);
    const byCand: Record<string, number> = {};
    let assigned = 0;
    cands.forEach((c, i) => {
      if (i === cands.length - 1) {
        byCand[c.id] = officeValid - assigned;
      } else {
        const v = round10((officeValid * (weights[i] ?? 0)) / total);
        byCand[c.id] = v;
        assigned += v;
      }
    });
    votes[office] = byCand;
  }
  return { eligible, turnout, blank, nullVotes, valid, validByOffice, votes };
}

function sumRaw(list: Raw[]): Raw {
  const out: Raw = {
    eligible: 0,
    turnout: 0,
    blank: 0,
    nullVotes: 0,
    valid: 0,
    validByOffice: {},
    votes: {},
  };
  for (const r of list) {
    out.eligible += r.eligible;
    out.turnout += r.turnout;
    out.blank += r.blank;
    out.nullVotes += r.nullVotes;
    out.valid += r.valid;
    for (const [office, v] of Object.entries(r.validByOffice) as [OfficeCode, number][]) {
      out.validByOffice[office] = (out.validByOffice[office] ?? 0) + v;
    }
    for (const [office, byCand] of Object.entries(r.votes) as [
      OfficeCode,
      Record<string, number>,
    ][]) {
      const acc = (out.votes[office] ??= {});
      for (const [cid, v] of Object.entries(byCand)) acc[cid] = (acc[cid] ?? 0) + v;
    }
  }
  return out;
}

/**
 * SYNTHETIC presidential comparison: the "lula" / "bolsonaro" keys are only the contract's
 * slots; the names shown are "Candidatura A/B (demo)" and every number is invented.
 */
function demoPresidentComparison(
  raw: Raw,
  history: Raw,
  precision: PresidentialComparison['precision'],
): PresidentialComparison {
  const slots = [
    { key: 'lula', id: 'demo-president-a', name: 'Candidatura A (demo)', number: 901 },
    { key: 'bolsonaro', id: 'demo-president-b', name: 'Candidatura B (demo)', number: 902 },
  ] as const;
  const valid26 = raw.validByOffice.president ?? null;
  const valid22 = history.validByOffice.president ?? null;
  const entries: PresidentialComparisonEntry[] = slots.map((c) => {
    const v26 = raw.votes.president?.[c.id] ?? null;
    const v22 = history.votes.president?.[c.id] ?? null;
    const s26 = v26 !== null && valid26 ? v26 / valid26 : null;
    const s22 = v22 !== null && valid22 ? v22 / valid22 : null;
    return {
      key: c.key,
      ballot_name_2022: c.name,
      ballot_name_2026: c.name,
      number_2022: c.number,
      number_2026: c.number,
      votes_2022_r1: v22,
      valid_2022_r1: valid22,
      share_2022_r1: s22,
      // The demo has no 2022 2nd round: shown as "sem dado" on purpose.
      votes_2022_r2: null,
      valid_2022_r2: null,
      share_2022_r2: null,
      votes_2026_r1: v26,
      valid_2026_r1: valid26,
      share_2026_r1: s26,
      delta_pp_r1: s26 !== null && s22 !== null ? Math.round((s26 - s22) * 10000) / 100 : null,
      delta_votes_r1: v26 !== null && v22 !== null ? v26 - v22 : null,
    };
  });
  return {
    precision,
    entries,
    note: 'DADOS DEMONSTRATIVOS: comparação sintética entre "Candidatura A" e "Candidatura B"; nenhum número é real.',
  };
}

function toMetrics(
  territoryId: string,
  year: number,
  round: number,
  raw: Raw,
  history: Raw | null,
  warnings: string[],
): TerritoryMetrics {
  const turnout: TurnoutMetrics = {
    eligible: raw.eligible,
    turnout: raw.turnout,
    abstention: raw.eligible - raw.turnout,
    abstention_rate: (raw.eligible - raw.turnout) / raw.eligible,
    turnout_rate: raw.turnout / raw.eligible,
    valid: raw.valid,
    blank: raw.blank,
    null_votes: raw.nullVotes,
    basis_office: 'governor',
  };
  const results: Partial<Record<OfficeCode, CandidateResult[]>> = {};
  for (const [office, byCand] of Object.entries(raw.votes) as [
    OfficeCode,
    Record<string, number>,
  ][]) {
    const officeValid = raw.validByOffice[office] ?? 0;
    results[office] = candidatesFor(office, year, round)
      .map((c) => ({
        candidate_id: c.id,
        ballot_name: c.name,
        party: 'PARTIDO DEMO',
        number: c.number,
        office,
        votes: byCand[c.id] ?? 0,
        share_of_valid: officeValid > 0 ? (byCand[c.id] ?? 0) / officeValid : 0,
        has_history: year === 2026 && c.hasHistory,
      }))
      .sort((a, b) => b.votes - a.votes);
  }
  const comparison: ComparisonPoint[] = [];
  if (history && year === 2026 && round === 1) {
    for (const office of ['governor', 'president'] as const) {
      for (const c of candidatesFor(office, 2026, 1).filter((x) => x.hasHistory)) {
        const v26 = raw.votes[office]?.[c.id] ?? null;
        const val26 = raw.validByOffice[office] ?? null;
        const v22 = history.votes[office]?.[c.id] ?? null;
        const val22 = history.validByOffice[office] ?? null;
        const s26 = v26 !== null && val26 ? v26 / val26 : null;
        const s22 = v22 !== null && val22 ? v22 / val22 : null;
        comparison.push({
          candidate_id: c.id,
          ballot_name: c.name,
          party: 'PARTIDO DEMO',
          office,
          votes_2022: v22,
          valid_2022: val22,
          votes_2026: v26,
          valid_2026: val26,
          delta_votes: v26 !== null && v22 !== null ? v26 - v22 : null,
          delta_pp: s26 !== null && s22 !== null ? Math.round((s26 - s22) * 10000) / 100 : null,
          note: null,
        });
      }
    }
  }
  return {
    territory_id: territoryId,
    year,
    round,
    status: 'demo',
    release_id: DEMO_RELEASE_ID,
    data_quality: 'demo',
    turnout,
    results,
    valid_by_office: raw.validByOffice,
    comparison_2022: comparison,
    president_comparison:
      history && year === 2026 && round === 1
        ? demoPresidentComparison(
            raw,
            history,
            territoryId.split('-').length > 2 ? 'approximate' : 'exact',
          )
        : null,
    warnings,
  };
}

// ---------------------------------------------------------------------------
export interface DemoSnapshotData {
  manifest: SnapshotManifest;
  index: TerritoryIndexEntry[];
  methodology: Methodology;
  candidates: CandidateIndex;
  /** keyed by relative path `metricsFilePath(...)` */
  metrics: Record<string, MunicipalityMetricsFile>;
  /** keyed by relative path `layerFilePath(...)` */
  layers: Record<string, MapLayerValues>;
  /** SYNTHETIC "por que Minas decide" numbers (labelled DEMO in the UI). */
  highlights: Highlights;
}

function bairroCentroid(muni: DemoMunicipality, i: number, n: number): [number, number] {
  const angle = (2 * Math.PI * i) / Math.max(n, 1) + 0.6;
  const radius = 0.018 + (i % 2) * 0.012;
  return [
    Math.round((muni.centroid[0] + Math.cos(angle) * radius) * 1e5) / 1e5,
    Math.round((muni.centroid[1] + Math.sin(angle) * radius) * 1e5) / 1e5,
  ];
}

let memo: DemoSnapshotData | null = null;

export function buildDemoSnapshot(): DemoSnapshotData {
  if (memo) return memo;

  const index: TerritoryIndexEntry[] = [
    {
      id: 'mg',
      type: 'state',
      name: 'Minas Gerais',
      slug: 'minas-gerais',
      parent_id: null,
      ibge_code: '31',
      state_code: 'MG',
      centroid: STATE_CENTROID,
      data_quality: 'demo',
      normalized_name: normalizeText('Minas Gerais'),
      municipality_name: null,
    },
  ];
  const metrics: Record<string, MunicipalityMetricsFile> = {};
  const muniRawByRound = new Map<string, Map<string, Raw>>(); // "year-round" → muniId → raw
  const stateSelf: TerritoryMetrics[] = [];

  for (const muni of DEMO_MUNICIPALITIES) {
    const muniId = `mg-${muni.ibge}`;
    index.push({
      id: muniId,
      type: 'municipality',
      name: muni.name,
      slug: slugify(muni.name),
      parent_id: 'mg',
      ibge_code: muni.ibge,
      state_code: 'MG',
      centroid: muni.centroid,
      data_quality: 'demo',
      polling_places: muni.bairros.length * 3 + 2,
      normalized_name: normalizeText(muni.name),
      municipality_name: muni.name,
    });
    const bairroIds = muni.bairros.map((b) => `${muniId}-${slugify(b)}`);
    muni.bairros.forEach((b, i) => {
      index.push({
        id: bairroIds[i]!,
        type: 'neighborhood',
        name: b,
        slug: slugify(b),
        parent_id: muniId,
        ibge_code: null,
        state_code: 'MG',
        centroid: bairroCentroid(muni, i, muni.bairros.length),
        data_quality: 'demo',
        polling_places: 2 + (i % 3),
        normalized_name: normalizeText(b),
        municipality_name: muni.name,
      });
    });

    const self: TerritoryMetrics[] = [];
    const children: Record<string, TerritoryMetrics[]> = {};
    const leafRaws = new Map<string, Raw>(); // `${id}|${year}|${round}`
    for (const { year, round, offices } of ROUNDS) {
      const leaves = muni.bairros.length
        ? bairroIds.map((id) => {
            const raw = leafRaw(id, year, round, offices);
            leafRaws.set(`${id}|${year}|${round}`, raw);
            return raw;
          })
        : [leafRaw(muniId, year, round, offices)];
      const muniRaw = sumRaw(leaves);
      leafRaws.set(`${muniId}|${year}|${round}`, muniRaw);
      const key = `${year}-${round}`;
      if (!muniRawByRound.has(key)) muniRawByRound.set(key, new Map());
      muniRawByRound.get(key)!.set(muniId, muniRaw);
    }
    for (const { year, round } of ROUNDS) {
      const hist = year === 2026 && round === 1 ? (leafRaws.get(`${muniId}|2022|1`) ?? null) : null;
      const warnings =
        muni.ibge === WARNING_MUNICIPALITY && year === 2026 && round === 1
          ? [
              'Exemplo de alerta (demonstração): quando a soma dos votos por candidatura difere do total de válidos acima de 0,5%, a divergência aparece aqui — registrada, nunca corrigida silenciosamente.',
            ]
          : [];
      self.push(
        toMetrics(muniId, year, round, leafRaws.get(`${muniId}|${year}|${round}`)!, hist, warnings),
      );
      bairroIds.forEach((bid) => {
        const bh = year === 2026 && round === 1 ? (leafRaws.get(`${bid}|2022|1`) ?? null) : null;
        (children[bid] ??= []).push(
          toMetrics(bid, year, round, leafRaws.get(`${bid}|${year}|${round}`)!, bh, []),
        );
      });
    }
    metrics[metricsFilePath(DEMO_RELEASE_ID, muniId)] = { territory_id: muniId, self, children };
  }

  // State level
  const stateRaws = new Map<string, Raw>();
  for (const { year, round } of ROUNDS) {
    stateRaws.set(
      `${year}-${round}`,
      sumRaw([...(muniRawByRound.get(`${year}-${round}`)?.values() ?? [])]),
    );
  }
  for (const { year, round } of ROUNDS) {
    const hist = year === 2026 && round === 1 ? (stateRaws.get('2022-1') ?? null) : null;
    stateSelf.push(toMetrics('mg', year, round, stateRaws.get(`${year}-${round}`)!, hist, []));
  }
  metrics[metricsFilePath(DEMO_RELEASE_ID, 'mg')] = {
    territory_id: 'mg',
    self: stateSelf,
    children: {},
  };

  // Layers (municipality values)
  const layers: Record<string, MapLayerValues> = {};
  const addLayer = (l: MapLayerValues, cand?: string | null) => {
    layers[layerFilePath(DEMO_RELEASE_ID, l.year, l.round, l.layer, cand)] = l;
  };
  const domainOf = (vals: number[], symmetric: boolean): [number, number] => {
    if (!vals.length) return [0, 1];
    if (symmetric) {
      const m = Math.max(...vals.map((v) => Math.abs(v)), 0.1);
      return [-m, m];
    }
    return [Math.min(...vals), Math.max(...vals)];
  };
  const muniMetrics = (year: number, round: number) =>
    DEMO_MUNICIPALITIES.map((m) => {
      const file = metrics[metricsFilePath(DEMO_RELEASE_ID, `mg-${m.ibge}`)]!;
      return file.self.find((s) => s.year === year && s.round === round)!;
    });
  for (const { year, round, offices } of ROUNDS) {
    const ms = muniMetrics(year, round);
    for (const layer of ['abstention', 'turnout'] as const) {
      const values: Record<string, number> = {};
      for (const m of ms) {
        if (m.turnout)
          values[m.territory_id] =
            layer === 'abstention' ? m.turnout.abstention_rate : m.turnout.turnout_rate;
      }
      addLayer({
        layer,
        year,
        round,
        unit: 'rate',
        candidate_id: null,
        values,
        domain: domainOf(Object.values(values), false),
      });
    }
    for (const office of offices) {
      for (const c of candidatesFor(office, year, round)) {
        const values: Record<string, number> = {};
        for (const m of ms) {
          const r = m.results[office]?.find((x) => x.candidate_id === c.id);
          if (r) values[m.territory_id] = r.share_of_valid;
        }
        addLayer(
          {
            layer: 'votes',
            year,
            round,
            unit: 'share',
            candidate_id: c.id,
            values,
            domain: domainOf(Object.values(values), false),
          },
          c.id,
        );
      }
    }
    if (year === 2026 && round === 1) {
      // Margin layers (A − B, p.p.) for 2026 r1 and 2022 r1; the demo has no 2022 r2 file.
      for (const [y, field] of [
        [2026, 'share_2026_r1'],
        [2022, 'share_2022_r1'],
      ] as const) {
        const values: Record<string, number> = {};
        for (const m of ms) {
          const e = m.president_comparison?.entries;
          const a = e?.find((x) => x.key === 'lula')?.[field];
          const b = e?.find((x) => x.key === 'bolsonaro')?.[field];
          if (a != null && b != null) values[m.territory_id] = Math.round((a - b) * 10000) / 100;
        }
        addLayer({
          layer: 'president_margin',
          year: y,
          round: 1,
          unit: 'pp',
          candidate_id: null,
          values,
          domain: domainOf(Object.values(values), true),
        });
      }
      for (const key of ['lula', 'bolsonaro'] as const) {
        const values: Record<string, number> = {};
        for (const m of ms) {
          const d = m.president_comparison?.entries.find((e) => e.key === key)?.delta_pp_r1;
          if (d !== null && d !== undefined) values[m.territory_id] = d;
        }
        addLayer(
          {
            layer: 'president_comparison',
            year,
            round,
            unit: 'pp',
            candidate_id: key,
            values,
            domain: domainOf(Object.values(values), true),
          },
          key,
        );
      }
      for (const office of ['president', 'governor'] as const) {
        for (const c of candidatesFor(office, 2026, 1).filter((x) => x.hasHistory)) {
          const values: Record<string, number> = {};
          for (const m of ms) {
            const p = m.comparison_2022.find((x) => x.candidate_id === c.id);
            if (p?.delta_pp !== null && p?.delta_pp !== undefined)
              values[m.territory_id] = p.delta_pp;
          }
          addLayer(
            {
              layer: 'comparison',
              year,
              round,
              unit: 'pp',
              candidate_id: c.id,
              values,
              domain: domainOf(Object.values(values), true),
            },
            c.id,
          );
        }
      }
    }
  }

  const candidates: CandidateIndex = { items: [] };
  for (const { year, round, offices } of ROUNDS) {
    for (const office of offices) {
      for (const c of candidatesFor(office, year, round)) {
        if (candidates.items.some((x) => x.candidate_id === c.id && x.year === year)) continue;
        candidates.items.push({
          candidate_id: c.id,
          ballot_name: c.name,
          party: 'PARTIDO DEMO',
          number: c.number,
          office,
          year,
          has_history: year === 2026 && c.hasHistory,
          has_layer: true,
        });
      }
    }
  }

  const methodology: Methodology = {
    version: 'demo-1',
    language: 'pt-BR',
    summary:
      'DADOS DEMONSTRATIVOS. Este conjunto é sintético e existe apenas para demonstrar a interface enquanto o snapshot oficial não é publicado. Nenhum número aqui representa eleitores, candidaturas ou resultados reais.',
    neighborhood_note:
      '“Bairro” é uma aproximação metodológica derivada do endereço do local de votação: eleitores de uma seção não necessariamente residem no bairro do local. Não existem limites oficiais de bairro nesta base; bairros aparecem como pontos.',
    comparison_note:
      'A comparação 2022 → 2026 mostra a diferença, em pontos percentuais, da participação nos votos válidos de cada candidatura com histórico. Variação não implica transferência de votos entre candidaturas.',
    denominators: {
      'Taxa de abstenção': 'abstenções ÷ eleitorado apto',
      Comparecimento: 'comparecimento ÷ eleitorado apto',
      'Participação nos válidos': 'votos da candidatura ÷ votos válidos do cargo no território',
      Senador:
        'em 2026 cada eleitor vota em até 2 candidaturas ao Senado; o denominador é o total de votos válidos para Senador',
    },
    sources: [
      {
        label: 'Dados eleitorais (demonstração)',
        note: 'Gerados sinteticamente no próprio aplicativo; não derivam de nenhuma base real.',
      },
      {
        label: 'Malha municipal',
        note: 'IBGE — API de malhas v3, qualidade mínima. Usada apenas como geometria de fundo.',
      },
    ],
    limitations: [
      'Os nomes de municípios e bairros desta demonstração são inventados.',
      'Os valores foram arredondados e não seguem distribuição real.',
      'Um município (Ribeirão Fictício) não tem bairros, para demonstrar o fluxo sem dados de bairro.',
    ],
  };

  const zeros = '0'.repeat(64);
  const files = [
    `${DEMO_RELEASE_ID}/territories-index.json`,
    `${DEMO_RELEASE_ID}/methodology.json`,
    `${DEMO_RELEASE_ID}/candidates.json`,
    ...Object.keys(metrics),
    ...Object.keys(layers),
  ].map((path) => ({ path, sha256: zeros, bytes: 0 }));

  const manifest: SnapshotManifest = {
    schema_version: 1,
    release_id: DEMO_RELEASE_ID,
    status: 'demo',
    generated_at: DEMO_GENERATED_AT,
    years: [2022, 2026],
    rounds: [1, 2],
    geographic_levels: ['state', 'municipality', 'neighborhood'],
    source_project_alias: 'demo-sintetico',
    source_tables: [],
    pipeline_commit: 'demo',
    territories_count: index.length,
    records_count: 0,
    indicator_types: ['abstention', 'turnout', 'votes', 'comparison'],
    files,
    methodology_version: methodology.version,
    coverage_notes: [
      'Snapshot oficial ainda não publicado: exibindo DADOS DEMONSTRATIVOS sintéticos (12 municípios fictícios).',
    ],
    warnings: [],
  };

  const state26 = stateSelf.find((m) => m.year === 2026 && m.round === 1)!;
  const st = state26.turnout!;
  const demoSource = 'DEMONSTRAÇÃO — número sintético gerado no aplicativo, sem fonte real';
  const pc = state26.president_comparison?.entries ?? [];
  const a = pc.find((e) => e.key === 'lula');
  const b = pc.find((e) => e.key === 'bolsonaro');
  const highlights: Highlights = {
    generated_at: DEMO_GENERATED_AT,
    items: [
      {
        id: 'mg_eligible_2026',
        label: 'Eleitorado apto (demonstração)',
        value: st.eligible,
        unit: 'people',
        compare_value: null,
        compare_label: null,
        note: null,
        source: demoSource,
      },
      {
        id: 'mg_municipalities',
        label: 'Municípios na demonstração',
        value: DEMO_MUNICIPALITIES.length,
        unit: 'count',
        compare_value: null,
        compare_label: null,
        note: null,
        source: demoSource,
      },
      {
        id: 'mg_2026_r1_margin_votes',
        label: 'Diferença Candidatura A − B (1º turno, demonstração)',
        value: (a?.votes_2026_r1 ?? 0) - (b?.votes_2026_r1 ?? 0),
        unit: 'votes',
        compare_value:
          a?.share_2026_r1 != null && b?.share_2026_r1 != null
            ? Math.round((a.share_2026_r1 - b.share_2026_r1) * 10000) / 100
            : null,
        compare_label: 'p.p. dos válidos',
        note: null,
        source: demoSource,
      },
      {
        id: 'mg_turnout_2026_r1',
        label: 'Comparecimento (demonstração)',
        value: st.turnout,
        unit: 'people',
        compare_value: Math.round(st.turnout_rate * 10000) / 100,
        compare_label: '% do eleitorado apto',
        note: null,
        source: demoSource,
      },
    ],
    why_minas: [
      {
        title: 'Demonstração',
        text: 'Estes números são sintéticos e servem apenas para mostrar a interface enquanto o snapshot oficial não está disponível.',
        value: null,
        unit: null,
        source: demoSource,
      },
    ],
  };

  memo = { manifest, index, methodology, candidates, metrics, layers, highlights };
  return memo;
}
