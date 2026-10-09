/**
 * Build the PUBLIC electoral snapshot from a private extract.
 *
 *   npm run etl:build -- --extract data/private/extract/<release> [--release <id>] [--out public/data] [--top 10]
 *
 * Input: files written by export.ts (polling-place level, gitignored).
 * Output: public/data/<release>/... + public/data/manifest.json (see shared/contracts/snapshot.ts).
 * Validations (spec §4.5/§4.13) produce `warnings`; blocking errors abort the build.
 * No PII and no SOURCE identifiers are written.
 */
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { normalizeText, slugify } from '../../shared/schemas/normalize.ts';
import { VOTES_PER_VOTER, type OfficeCode } from '../../shared/contracts/metrics.ts';
import type {
  CandidateResult,
  ComparisonPoint,
  MapLayerValues,
  SnapshotManifest,
  TerritoryMetrics,
} from '../../shared/contracts/metrics.ts';
import type { TerritoryIndexEntry } from '../../shared/contracts/territory.ts';
import type {
  CandidateIndex,
  Methodology,
  MunicipalityMetricsFile,
} from '../../shared/contracts/snapshot.ts';
import { CARGO_TO_OFFICE } from './sql.ts';

// ---------- args ----------
const argv = process.argv.slice(2);
const getArg = (k: string) => {
  const i = argv.indexOf(k);
  return i >= 0 ? argv[i + 1] : undefined;
};
const extractDir = resolve(getArg('--extract') ?? '');
if (!extractDir || !existsSync(join(extractDir, 'extract-manifest.json'))) {
  console.error('build-snapshot: --extract <dir> with extract-manifest.json is required');
  process.exit(1);
}
const outRoot = resolve(getArg('--out') ?? join('public', 'data'));
const TOP_N = Number(getArg('--top') ?? 10);
const YEAR = 2026;
const ROUND = 1;

// ---------- input types ----------
interface Municipio {
  cd_municipio: string;
  cd_ibge: number;
  nome: string;
  lat: number;
  lon: number;
}
interface Local {
  id: number;
  cd_municipio: string;
  cd_ibge: number;
  nome: string;
  bairro: string;
  lat: number;
  lon: number;
  coord_aproximada: boolean;
  qt_secoes: number;
}
interface Totais {
  local_id: number;
  cd_cargo: number;
  aptos: number;
  comparecimento: number;
  validos: number;
  brancos: number;
  nulos: number;
}
interface Candidatura {
  id: number;
  cd_cargo: number;
  tipo: string;
  numero: number;
  nm_urna: string | null;
  sg_partido: string | null;
  votos_total: number;
}
interface VoteRow {
  candidatura_id: number;
  local_id: number;
  votos: number;
}
interface HistRow {
  candidatura_id: number;
  ano: number;
  nivel: string;
  cd_municipio: string;
  chave: string;
  votos: number;
  validos: number;
}

const readJson = <T>(name: string): T =>
  JSON.parse(readFileSync(join(extractDir, name), 'utf8')) as T;
const extractManifest = readJson<{
  release_id: string;
  scope: { uf: string; ibge?: string };
  generated_at: string;
  health_before: unknown;
  health_after: unknown;
  total_rows: number;
  files: { file: string }[];
}>('extract-manifest.json');
const releaseId = getArg('--release') ?? extractManifest.release_id;
const isPartial = Boolean(extractManifest.scope.ibge);

console.log(`[build] extract=${extractDir} release=${releaseId} partial=${isPartial}`);

// ---------- load dimensions ----------
const municipios = readJson<Municipio[]>('municipios.json');
const locais = readJson<Local[]>('locais.json');
const candidaturas = readJson<Candidatura[]>('candidaturas.json');
const historico = existsSync(join(extractDir, 'historico-2022.json'))
  ? readJson<HistRow[]>('historico-2022.json')
  : [];

const munIdByCd = new Map(municipios.map((m) => [m.cd_municipio, `mg-${m.cd_ibge}`]));

// territory of each polling place: [municipalityId, neighborhoodId]
interface TerritoryAgg {
  id: string;
  type: 'state' | 'municipality' | 'neighborhood';
  name: string;
  parent_id: string | null;
  ibge: string | null;
  lat: number[];
  lon: number[];
  locais: Set<number>;
  approxCount: number;
  sections: number;
  rawBairroNames: Set<string>;
}
const terr = new Map<string, TerritoryAgg>();
const ensure = (id: string, init: () => TerritoryAgg) => {
  let t = terr.get(id);
  if (!t) {
    t = init();
    terr.set(id, t);
  }
  return t;
};
ensure('mg', () => ({
  id: 'mg',
  type: 'state',
  name: 'Minas Gerais',
  parent_id: null,
  ibge: '31',
  lat: [],
  lon: [],
  locais: new Set(),
  approxCount: 0,
  sections: 0,
  rawBairroNames: new Set(),
}));
for (const m of municipios) {
  ensure(`mg-${m.cd_ibge}`, () => ({
    id: `mg-${m.cd_ibge}`,
    type: 'municipality',
    name: titleCase(m.nome),
    parent_id: 'mg',
    ibge: String(m.cd_ibge),
    lat: [m.lat],
    lon: [m.lon],
    locais: new Set(),
    approxCount: 0,
    sections: 0,
    rawBairroNames: new Set(),
  }));
}
const localTerritories = new Map<number, [string, string]>();
for (const l of locais) {
  const munId = munIdByCd.get(l.cd_municipio);
  if (!munId) throw new Error(`local ${l.id} references unknown municipality ${l.cd_municipio}`);
  const slug = slugify(l.bairro) || 'sem-bairro';
  const nbId = `${munId}-${slug}`;
  const mun = terr.get(munId)!;
  mun.locais.add(l.id);
  mun.sections += l.qt_secoes;
  if (l.coord_aproximada) mun.approxCount++;
  const nb = ensure(nbId, () => ({
    id: nbId,
    type: 'neighborhood',
    name: titleCase(l.bairro),
    parent_id: munId,
    ibge: null,
    lat: [],
    lon: [],
    locais: new Set(),
    approxCount: 0,
    sections: 0,
    rawBairroNames: new Set(),
  }));
  nb.locais.add(l.id);
  nb.sections += l.qt_secoes;
  nb.rawBairroNames.add(l.bairro);
  if (l.coord_aproximada) nb.approxCount++;
  else {
    nb.lat.push(l.lat);
    nb.lon.push(l.lon);
  }
  const st = terr.get('mg')!;
  st.locais.add(l.id);
  st.sections += l.qt_secoes;
  if (l.coord_aproximada) st.approxCount++;
  localTerritories.set(l.id, [munId, nbId]);
}
console.log(
  `[build] territories: ${terr.size} (municipalities ${municipios.length}, neighborhoods ${terr.size - municipios.length - 1})`,
);

// ---------- totals per territory per office ----------
type Tot = { aptos: number; comp: number; val: number; br: number; nu: number };
const totals = new Map<string, Tot>(); // key `${territory}|${office}`
const addTot = (key: string, t: Totais) => {
  const cur = totals.get(key) ?? { aptos: 0, comp: 0, val: 0, br: 0, nu: 0 };
  cur.aptos += t.aptos;
  cur.comp += t.comparecimento;
  cur.val += t.validos;
  cur.br += t.brancos;
  cur.nu += t.nulos;
  totals.set(key, cur);
};
for (const cargo of Object.keys(CARGO_TO_OFFICE).map(Number)) {
  const file = `totais-cargo-${cargo}.json`;
  if (!existsSync(join(extractDir, file))) continue;
  const office = CARGO_TO_OFFICE[cargo]!;
  for (const t of readJson<Totais[]>(file)) {
    const ids = localTerritories.get(t.local_id);
    if (!ids) continue;
    if (t.aptos < 0 || t.comparecimento < 0 || t.validos < 0 || t.brancos < 0 || t.nulos < 0)
      throw new Error(`negative totals at local ${t.local_id}`);
    for (const tid of ['mg', ids[0], ids[1]]) addTot(`${tid}|${office}`, t);
  }
}

// ---------- votes per territory per candidate ----------
const candById = new Map(candidaturas.map((c) => [c.id, c]));
const trackedIds = new Set(historico.map((h) => h.candidatura_id));
const votes = new Map<string, Map<number, number>>(); // territory → (cand → votes)
const addVote = (tid: string, cand: number, v: number) => {
  let m = votes.get(tid);
  if (!m) {
    m = new Map();
    votes.set(tid, m);
  }
  m.set(cand, (m.get(cand) ?? 0) + v);
};
const voteFiles = readdirSync(extractDir)
  .filter((f) => f.startsWith('votes-cargo-'))
  .sort();
let pairs = 0;
for (const f of voteFiles) {
  for (const r of readJson<VoteRow[]>(f)) {
    if (r.votos < 0) throw new Error(`negative votes in ${f}`);
    const ids = localTerritories.get(r.local_id);
    if (!ids) continue;
    pairs++;
    addVote('mg', r.candidatura_id, r.votos);
    addVote(ids[0], r.candidatura_id, r.votos);
    addVote(ids[1], r.candidatura_id, r.votos);
  }
}
console.log(`[build] vote pairs aggregated: ${pairs} from ${voteFiles.length} files`);

// ---------- 2022 history lookup ----------
const hist = new Map<string, { votos: number; validos: number }>(); // `${territory}|${cand}`
for (const h of historico) {
  if (h.ano !== 2022) continue;
  const munId = munIdByCd.get(h.cd_municipio);
  if (!munId) continue;
  if (h.nivel === 'municipio') {
    const key = `${munId}|${h.candidatura_id}`;
    const cur = hist.get(key) ?? { votos: 0, validos: 0 };
    cur.votos += h.votos;
    cur.validos = Math.max(cur.validos, h.validos);
    hist.set(key, cur);
    const st = hist.get(`mg|${h.candidatura_id}`) ?? { votos: 0, validos: 0 };
    st.votos += h.votos;
    st.validos += h.validos;
    hist.set(`mg|${h.candidatura_id}`, st);
  } else if (h.nivel === 'bairro') {
    const bairro = h.chave.split('|').slice(1).join('|');
    const nbId = `${munId}-${slugify(bairro) || 'sem-bairro'}`;
    const key = `${nbId}|${h.candidatura_id}`;
    const cur = hist.get(key) ?? { votos: 0, validos: 0 };
    cur.votos += h.votos;
    cur.validos += h.validos;
    hist.set(key, cur);
  }
}

// ---------- build metrics per territory ----------
const globalWarnings: string[] = [];
let recordsCount = 0;
const WARN_TOL = 0.005;

function buildMetrics(t: TerritoryAgg): TerritoryMetrics {
  const warnings: string[] = [];
  const president = totals.get(`${t.id}|president`);
  let turnout: TerritoryMetrics['turnout'] = null;
  if (president) {
    const abst = president.aptos - president.comp;
    if (abst < 0) warnings.push('Comparecimento maior que eleitorado apto na fonte.');
    turnout = {
      eligible: president.aptos,
      turnout: president.comp,
      abstention: Math.max(0, abst),
      abstention_rate: president.aptos > 0 ? Math.max(0, abst) / president.aptos : 0,
      turnout_rate: president.aptos > 0 ? Math.min(1, president.comp / president.aptos) : 0,
      valid: president.val,
      blank: president.br,
      null_votes: president.nu,
      basis_office: 'president',
    };
  }
  const results: Partial<Record<OfficeCode, CandidateResult[]>> = {};
  const validByOffice: Partial<Record<OfficeCode, number>> = {};
  const tv = votes.get(t.id) ?? new Map<number, number>();
  for (const cargo of Object.keys(CARGO_TO_OFFICE).map(Number)) {
    const office = CARGO_TO_OFFICE[cargo] as OfficeCode;
    const tot = totals.get(`${t.id}|${office}`);
    if (!tot) continue;
    validByOffice[office] = tot.val;
    const vpv = VOTES_PER_VOTER[office];
    const sumVbn = tot.val + tot.br + tot.nu;
    if (tot.comp > 0 && Math.abs(sumVbn - tot.comp * vpv) > WARN_TOL * tot.comp * vpv) {
      warnings.push(
        `${office}: válidos+brancos+nulos (${sumVbn}) difere de comparecimento×${vpv} (${tot.comp * vpv}).`,
      );
    }
    const list: CandidateResult[] = [];
    let sumCand = 0;
    for (const [cid, v] of tv) {
      const c = candById.get(cid);
      if (!c || c.cd_cargo !== cargo) continue;
      sumCand += v;
      if (c.tipo !== 'nominal') continue; // legenda votes count in valid but are not candidates
      if (tot.val > 0 && v > tot.val) {
        warnings.push(
          `${office}: candidatura ${c.nm_urna ?? c.numero} tem ${v} votos acima dos ${tot.val} válidos (votos possivelmente anulados sub judice na fonte).`,
        );
      }
      list.push({
        candidate_id: String(cid),
        ballot_name: c.nm_urna ?? `Nº ${c.numero}`,
        party: c.sg_partido ?? '',
        number: c.numero,
        office,
        votes: v,
        share_of_valid: tot.val > 0 ? Math.min(1, v / tot.val) : 0,
        has_history: trackedIds.has(cid),
      });
    }
    if (tot.val > 0 && Math.abs(sumCand - tot.val) > WARN_TOL * tot.val) {
      warnings.push(
        `${office}: soma dos votos de candidaturas (${sumCand}) difere dos válidos (${tot.val}) além da tolerância.`,
      );
    }
    list.sort((a, b) => b.votes - a.votes || a.number - b.number);
    const isProportional = office === 'federal_deputy' || office === 'state_deputy';
    results[office] = isProportional
      ? [...list.slice(0, TOP_N), ...list.slice(TOP_N).filter((c) => c.has_history)]
      : list;
    recordsCount += results[office]!.length;
  }
  const comparison: ComparisonPoint[] = [];
  for (const cid of trackedIds) {
    const c = candById.get(cid);
    if (!c) continue;
    const office = CARGO_TO_OFFICE[c.cd_cargo] as OfficeCode;
    const h = hist.get(`${t.id}|${cid}`);
    const v26 = tv.get(cid) ?? null;
    const val26 = validByOffice[office] ?? null;
    const s22 = h && h.validos > 0 ? h.votos / h.validos : null;
    const s26 = v26 !== null && val26 ? v26 / val26 : null;
    comparison.push({
      candidate_id: String(cid),
      ballot_name: c.nm_urna ?? `Nº ${c.numero}`,
      party: c.sg_partido ?? '',
      office,
      votes_2022: h ? h.votos : null,
      valid_2022: h ? h.validos : null,
      votes_2026: v26,
      valid_2026: val26,
      delta_votes: h && v26 !== null ? v26 - h.votos : null,
      delta_pp: s22 !== null && s26 !== null ? Math.round((s26 - s22) * 10000) / 100 : null,
      note: h
        ? t.type === 'neighborhood'
          ? 'Comparação por bairro é aproximada (chave textual do local de votação).'
          : null
        : 'Sem dado de 2022 para este recorte.',
    });
  }
  if (t.approxCount > 0)
    warnings.push(`${t.approxCount} local(is) de votação com coordenada aproximada.`);
  if (t.type === 'neighborhood')
    warnings.push('Bairro derivado do endereço do local de votação; aproximação metodológica.');
  const dq: TerritoryMetrics['data_quality'] = !president
    ? 'unavailable'
    : t.type === 'neighborhood'
      ? 'approximate'
      : Object.keys(validByOffice).length === 5
        ? 'complete'
        : 'incomplete';
  return {
    territory_id: t.id,
    year: YEAR,
    round: ROUND,
    status: isPartial ? 'partial' : 'validated',
    release_id: releaseId,
    data_quality: dq,
    turnout,
    results,
    valid_by_office: validByOffice,
    comparison_2022: comparison,
    warnings,
  };
}

// ---------- write output ----------
const outDir = join(outRoot, releaseId);
rmSync(outDir, { recursive: true, force: true });
mkdirSync(join(outDir, 'metrics'), { recursive: true });
mkdirSync(join(outDir, 'layers'), { recursive: true });
const files: { path: string; sha256: string; bytes: number }[] = [];
const emit = (rel: string, data: unknown) => {
  const text = JSON.stringify(data);
  if (/dashboard-eleicoes|supabase\.co|postgres(ql)?:\/\//i.test(text))
    throw new Error(`refusing to write ${rel}: contains a SOURCE identifier`);
  writeFileSync(join(outDir, rel), text, 'utf8');
  files.push({
    path: `${releaseId}/${rel}`,
    sha256: createHash('sha256').update(text).digest('hex'),
    bytes: Buffer.byteLength(text),
  });
};

// territories index
const index: TerritoryIndexEntry[] = [];
const metricsByTerritory = new Map<string, TerritoryMetrics>();
for (const t of terr.values()) {
  const m = buildMetrics(t);
  metricsByTerritory.set(t.id, m);
  const centroid: [number, number] | null = t.lon.length ? [avg(t.lon), avg(t.lat)] : null;
  const munName =
    t.type === 'neighborhood'
      ? terr.get(t.parent_id!)!.name
      : t.type === 'municipality'
        ? t.name
        : null;
  index.push({
    id: t.id,
    type: t.type,
    name: t.name,
    slug: t.id,
    parent_id: t.parent_id,
    ibge_code: t.ibge,
    state_code: 'MG',
    centroid: centroid ? [round6(centroid[0]), round6(centroid[1])] : null,
    data_quality: m.data_quality,
    polling_places: t.locais.size,
    normalized_name: normalizeText(t.name),
    municipality_name: munName,
  });
  if (t.rawBairroNames.size > 1)
    globalWarnings.push(
      `${t.id}: grafias distintas de bairro unificadas (${[...t.rawBairroNames].slice(0, 3).join(' / ')}).`,
    );
}
index.sort((a, b) =>
  a.type === b.type ? a.name.localeCompare(b.name, 'pt-BR') : a.type.localeCompare(b.type),
);
emit('territories-index.json', index);

// metrics files: state + one per municipality (with its neighborhoods)
emit('metrics/mg.json', {
  territory_id: 'mg',
  self: [metricsByTerritory.get('mg')!],
  children: {},
} satisfies MunicipalityMetricsFile);
for (const m of municipios) {
  const id = `mg-${m.cd_ibge}`;
  const children: Record<string, TerritoryMetrics[]> = {};
  for (const t of terr.values())
    if (t.parent_id === id) children[t.id] = [metricsByTerritory.get(t.id)!];
  emit(`metrics/${id}.json`, {
    territory_id: id,
    self: [metricsByTerritory.get(id)!],
    children,
  } satisfies MunicipalityMetricsFile);
}

// candidates index
const candidateIndex: CandidateIndex = {
  items: candidaturas
    .filter((c) => c.tipo === 'nominal')
    .map((c) => ({
      candidate_id: String(c.id),
      ballot_name: c.nm_urna ?? `Nº ${c.numero}`,
      party: c.sg_partido ?? '',
      number: c.numero,
      office: CARGO_TO_OFFICE[c.cd_cargo] as OfficeCode,
      year: YEAR,
      has_history: trackedIds.has(c.id),
      has_layer: [1, 3, 5].includes(c.cd_cargo) || trackedIds.has(c.id),
    }))
    .sort((a, b) => a.office.localeCompare(b.office) || a.number - b.number),
};
emit('candidates.json', candidateIndex);

// layers (municipality level)
const munIds = municipios.map((m) => `mg-${m.cd_ibge}`);
const layer = (
  name: MapLayerValues['layer'],
  unit: MapLayerValues['unit'],
  candidateId: string | null,
  pick: (m: TerritoryMetrics) => number | null,
) => {
  const values: Record<string, number> = {};
  let lo = Infinity,
    hi = -Infinity;
  for (const id of munIds) {
    const v = pick(metricsByTerritory.get(id)!);
    if (v === null || Number.isNaN(v)) continue;
    values[id] = round4(v);
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  if (!Number.isFinite(lo)) {
    lo = 0;
    hi = 0;
  }
  emit(`layers/${YEAR}-r${ROUND}-${name}${candidateId ? `-${candidateId}` : ''}.json`, {
    layer: name,
    year: YEAR,
    round: ROUND,
    unit,
    candidate_id: candidateId,
    values,
    domain: [round4(lo), round4(hi)],
  } satisfies MapLayerValues);
};
layer('abstention', 'rate', null, (m) => m.turnout?.abstention_rate ?? null);
layer('turnout', 'rate', null, (m) => m.turnout?.turnout_rate ?? null);
for (const c of candidateIndex.items.filter((c) => c.has_layer)) {
  layer(
    'votes',
    'share',
    c.candidate_id,
    (m) =>
      m.results[c.office]?.find((r) => r.candidate_id === c.candidate_id)?.share_of_valid ??
      (m.valid_by_office[c.office] ? 0 : null),
  );
  if (c.has_history)
    layer(
      'comparison',
      'pp',
      c.candidate_id,
      (m) => m.comparison_2022.find((x) => x.candidate_id === c.candidate_id)?.delta_pp ?? null,
    );
}

// methodology
const methodology: Methodology = {
  version: '1.0.0',
  language: 'pt-BR',
  summary:
    'Resultados do 1º turno de 2026 agregados a partir de locais de votação de Minas Gerais. Indicadores por município somam todos os locais do município; indicadores por bairro somam os locais cujo endereço informa aquele bairro.',
  neighborhood_note:
    'O "bairro" é o bairro do endereço do local de votação, não a residência do eleitor. Eleitores de uma seção podem morar em outro bairro. Não há limites oficiais de bairro; a representação é por ponto (média das coordenadas dos locais).',
  comparison_note:
    'A comparação 2022 → 2026 existe apenas para candidaturas com histórico disponível. Diferenças em pontos percentuais (participação nos votos válidos) e em votos absolutos não indicam transferência de votos entre candidaturas.',
  denominators: {
    abstention_rate: 'abstenção ÷ eleitorado apto',
    turnout_rate: 'comparecimento ÷ eleitorado apto',
    share_of_valid: 'votos da candidatura ÷ votos válidos do cargo no território',
    senator:
      'em 2026 cada eleitor vota em 2 candidaturas ao Senado; válidos do cargo refletem isso',
  },
  sources: [
    {
      label: 'Resultados por local de votação (TSE), consolidados em base de dados do projeto',
      note: 'Extração offline somente leitura; base pública de resultados e locais de votação.',
    },
    { label: 'Malha municipal', note: 'IBGE, API de malhas v3, quando carregada no mapa.' },
  ],
  limitations: [
    'Sem 2º turno de 2026 nesta versão.',
    'Histórico de 2022 disponível apenas para candidaturas rastreadas; sem abstenção de 2022.',
    'Para Deputado Federal e Estadual, exibe-se as 10 candidaturas mais votadas por território além das rastreadas; votos de legenda compõem os válidos mas não aparecem como candidaturas.',
    'A fonte exclui dos votos válidos os votos de candidaturas anuladas sub judice; por isso a soma dos votos de candidaturas pode superar os válidos (em Deputado Federal, 94.114 votos em MG, 0,75 %). As divergências são mantidas e sinalizadas, nunca corrigidas.',
    `${terr.get('mg')!.approxCount} locais de votação com coordenada aproximada.`,
  ],
};
emit('methodology.json', methodology);

// manifest
let commit = 'unknown';
try {
  commit = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
} catch {
  /* no commit yet */
}
const manifest: SnapshotManifest = {
  schema_version: 1,
  release_id: releaseId,
  status: isPartial ? 'partial' : 'validated',
  generated_at: new Date().toISOString(),
  years: historico.length ? [2022, YEAR] : [YEAR],
  rounds: [ROUND],
  geographic_levels: ['state', 'municipality', 'neighborhood'],
  source_project_alias: 'electoral-source-readonly',
  source_tables: [
    'municipios',
    'locais',
    'totais_local',
    'candidaturas',
    'votos_cand',
    'historico_votos',
  ],
  pipeline_commit: commit,
  territories_count: index.length,
  records_count: recordsCount,
  indicator_types: [
    'eligible',
    'turnout',
    'abstention',
    'abstention_rate',
    'valid',
    'blank',
    'null_votes',
    'votes',
    'share_of_valid',
    'delta_pp_2022_2026',
  ],
  files,
  methodology_version: methodology.version,
  coverage_notes: [
    isPartial
      ? `Cobertura parcial: apenas o município IBGE ${extractManifest.scope.ibge}.`
      : `Cobertura: ${municipios.length} municípios de Minas Gerais, ${locais.length} locais de votação.`,
    'Eleição 2026, 1º turno; histórico 2022 apenas para candidaturas rastreadas.',
  ],
  warnings: globalWarnings
    .slice(0, 200)
    .concat(globalWarnings.length > 200 ? [`… e mais ${globalWarnings.length - 200} avisos.`] : []),
};
mkdirSync(outRoot, { recursive: true });
writeFileSync(join(outRoot, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
const totalBytes = files.reduce((a, f) => a + f.bytes, 0);
console.log(
  `[build] wrote ${files.length} files (${(totalBytes / 1024 / 1024).toFixed(1)} MB) + manifest → ${outRoot} status=${manifest.status} warnings=${globalWarnings.length}`,
);

// ---------- helpers ----------
function avg(a: number[]) {
  return a.reduce((x, y) => x + y, 0) / a.length;
}
function round4(n: number) {
  return Math.round(n * 10000) / 10000;
}
function round6(n: number) {
  return Math.round(n * 1e6) / 1e6;
}
function titleCase(s: string) {
  const small = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'd']);
  return s
    .toLowerCase()
    .split(/\s+/)
    .map((w, i) => (i > 0 && small.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}
