/**
 * Build the PUBLIC electoral snapshot from a private extract.
 *
 *   npm run etl:build -- --extract data/private/extract/<release> [--release <id>] [--out public/data] [--top 10] [--no-activate]
 *       [--tse2022 data/private/tse/2022/president-2022.json] [--national2026 data/private/tse/2026/national-2026.json]
 *
 * Input: files written by export.ts (polling-place level, gitignored).
 * Output: public/data/<release>/... + <release>/release-manifest.json + public/data/manifest.json (current-release pointer; skipped with --no-activate).
 * Election year/round come from extract-manifest.json (legacy extracts without them = 2026 r1).
 * Validations (spec §4.5/§4.13) produce `warnings`; blocking errors abort the build.
 * No PII and no SOURCE identifiers are written.
 *
 * Rodada 3: tracked-candidate history (historico-2022.json) is no longer used: comparison_2022 is [] and
 * has_history is false. The 2022 -> 2026 comparison is presidential (Lula 13 / Bolsonaro 22) with 2022 from
 * TSE open data (scripts/tse/fetch-2022.ts) -> TerritoryMetrics.president_comparison, layers
 * <year>-r<round>-president_comparison-{lula,bolsonaro}.json and highlights.json.
 */
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { normalizeText, slugify } from '../../shared/schemas/normalize.ts';
import { VOTES_PER_VOTER, type OfficeCode } from '../../shared/contracts/metrics.ts';
import type {
  CandidateResult,
  MapLayerValues,
  PresidentialComparison,
  SnapshotManifest,
  TerritoryMetrics,
} from '../../shared/contracts/metrics.ts';
import type { TerritoryIndexEntry } from '../../shared/contracts/territory.ts';
import type {
  CandidateIndex,
  Highlights,
  Methodology,
  MunicipalityMetricsFile,
} from '../../shared/contracts/snapshot.ts';
import { CARGO_TO_OFFICE } from './sql.ts';
import {
  addInto,
  buildEntry,
  emptyVotes,
  localKey,
  matchLocal,
  matchRate,
  MIN_MATCH_RATE,
  symmetricDomain,
  type National2026File,
  type Place2026,
  type PresVotes,
  type President2022File,
} from '../tse/president-2022.ts';
import { buildHighlights } from '../tse/highlights.ts';

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
const tse2022Path = resolve(
  getArg('--tse2022') ?? join('data', 'private', 'tse', '2022', 'president-2022.json'),
);
const national2026Path = resolve(
  getArg('--national2026') ?? join('data', 'private', 'tse', '2026', 'national-2026.json'),
);

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
  nr_zona: number;
  nr_local: number;
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

const readJson = <T>(name: string): T =>
  JSON.parse(readFileSync(join(extractDir, name), 'utf8')) as T;
const extractManifest = readJson<{
  release_id: string;
  /** election scope written by export.ts (absent in legacy extracts = 2026, round 1) */
  year?: number;
  round?: number;
  election_codes?: number[];
  scope: { uf: string; ibge?: string };
  generated_at: string;
  health_before: unknown;
  health_after: unknown;
  total_rows: number;
  files: { file: string }[];
}>('extract-manifest.json');
const releaseId = getArg('--release') ?? extractManifest.release_id;
const LEGACY_EXTRACT = extractManifest.year === undefined || extractManifest.round === undefined;
const YEAR = extractManifest.year ?? 2026;
const ROUND = extractManifest.round ?? 1;
if (!Number.isInteger(YEAR) || !Number.isInteger(ROUND) || ROUND < 1 || ROUND > 2)
  throw new Error(`build-snapshot: invalid election scope in extract-manifest (${YEAR} r${ROUND})`);
const ROUND_LABEL = `${ROUND}º turno de ${YEAR}`;
const ACTIVATE = !argv.includes('--no-activate');
const isPartial = Boolean(extractManifest.scope.ibge);

console.log(
  `[build] extract=${extractDir} release=${releaseId} election=${YEAR}r${ROUND}${LEGACY_EXTRACT ? ' (legacy extract without year/round: assuming 2026 r1)' : ''} partial=${isPartial}`,
);

// ---------- load dimensions ----------
const municipios = readJson<Municipio[]>('municipios.json');
const locais = readJson<Local[]>('locais.json');
const candidaturas = readJson<Candidatura[]>('candidaturas.json');
// historico-2022.json (tracked candidacies) is deliberately NOT read since rodada 3 (owner decision).
const tse2022: President2022File | null = existsSync(tse2022Path)
  ? (JSON.parse(readFileSync(tse2022Path, 'utf8')) as President2022File)
  : null;
const national2026: National2026File | null = existsSync(national2026Path)
  ? (JSON.parse(readFileSync(national2026Path, 'utf8')) as National2026File)
  : null;
if (!tse2022)
  console.warn(
    `[build] WARNING: ${tse2022Path} not found (run npm run tse:2022); president_comparison = null`,
  );
if (tse2022 && tse2022.schema !== 'president-2022/v1')
  throw new Error('unexpected president-2022 schema');

const munIdByCd = new Map(municipios.map((m) => [m.cd_municipio, `mg-${m.cd_ibge}`]));
/** TSE code without leading zeros (as stored by fetch-2022.ts) by municipality id */
const tseCdByMunId = new Map(
  municipios.map((m) => [`mg-${m.cd_ibge}`, String(Number(m.cd_municipio))]),
);

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
const places2026 = new Map<string, Place2026>();
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
  places2026.set(localKey(l.cd_municipio, l.nr_zona, l.nr_local), {
    neighborhood_id: nbId,
    lat: l.coord_aproximada ? null : l.lat,
    lon: l.coord_aproximada ? null : l.lon,
  });
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

// ---------- presidential comparison: 2026 candidacies, 2022 neighborhood matching ----------
const pres2026 = {
  lula: candidaturas.find((c) => c.cd_cargo === 1 && c.numero === 13),
  bolsonaro: candidaturas.find((c) => c.cd_cargo === 1 && c.numero === 22),
};
if (pres2026.lula && (pres2026.lula.nm_urna !== 'LULA' || pres2026.lula.sg_partido !== 'PT'))
  throw new Error(
    `president 13 is ${pres2026.lula.nm_urna} (${pres2026.lula.sg_partido}), expected LULA (PT)`,
  );
if (
  pres2026.bolsonaro &&
  (!/BOLSONARO/.test(pres2026.bolsonaro.nm_urna ?? '') || pres2026.bolsonaro.sg_partido !== 'PL')
)
  throw new Error(
    `president 22 is ${pres2026.bolsonaro.nm_urna} (${pres2026.bolsonaro.sg_partido}), expected * BOLSONARO (PL)`,
  );
console.log(
  `[build] president 2026: 13=${pres2026.lula?.nm_urna} (${pres2026.lula?.sg_partido}), 22=${pres2026.bolsonaro?.nm_urna} (${pres2026.bolsonaro?.sg_partido})`,
);

/** 2022 votes per neighborhood (approximate) and per-municipality match statistics. */
const nb2022 = new Map<string, { r1: PresVotes; r2: PresVotes; places: number }>();
interface MunMatch {
  total_valid: number;
  matched_valid: number;
  places: number;
  same_place: number;
  bairro_name: number;
  none: number;
  rejected_far: number;
}
const munMatch = new Map<string, MunMatch>();
const matchTotals = {
  places: 0,
  same_place: 0,
  bairro_name: 0,
  none: 0,
  rejected_far: 0,
  total_valid: 0,
  matched_valid: 0,
  no_municipality: 0,
};
let munBelow = 0;
if (tse2022 && ROUND === 1 && YEAR === 2026) {
  const neighborhoodIds = new Set(
    [...terr.values()].filter((t) => t.type === 'neighborhood').map((t) => t.id),
  );
  const munIdByTseCd = new Map([...tseCdByMunId].map(([id, cd]) => [cd, id]));
  for (const l of Object.values(tse2022.locals)) {
    const munId = munIdByTseCd.get(String(Number(l.cd_municipio)));
    if (!munId) {
      matchTotals.no_municipality++;
      continue;
    }
    const mm = munMatch.get(munId) ?? {
      total_valid: 0,
      matched_valid: 0,
      places: 0,
      same_place: 0,
      bairro_name: 0,
      none: 0,
      rejected_far: 0,
    };
    const r = matchLocal(l, munId.slice(3), places2026, neighborhoodIds);
    mm.places++;
    mm.total_valid += l.r1.valid;
    mm[r.method]++;
    if (r.rejected_far) mm.rejected_far++;
    if (r.neighborhood_id) {
      mm.matched_valid += l.r1.valid;
      const a = nb2022.get(r.neighborhood_id) ?? { r1: emptyVotes(), r2: emptyVotes(), places: 0 };
      addInto(a.r1, l.r1);
      addInto(a.r2, l.r2);
      a.places++;
      nb2022.set(r.neighborhood_id, a);
    }
    munMatch.set(munId, mm);
  }
  for (const mm of munMatch.values()) {
    matchTotals.places += mm.places;
    matchTotals.same_place += mm.same_place;
    matchTotals.bairro_name += mm.bairro_name;
    matchTotals.none += mm.none;
    matchTotals.rejected_far += mm.rejected_far;
    matchTotals.total_valid += mm.total_valid;
    matchTotals.matched_valid += mm.matched_valid;
    if (matchRate(mm.matched_valid, mm.total_valid) < MIN_MATCH_RATE) munBelow++;
  }
  console.log(
    `[build] 2022 places -> neighborhoods: places=${matchTotals.places} same_place=${matchTotals.same_place} bairro_name=${matchTotals.bairro_name} unmatched=${matchTotals.none} rejected_far=${matchTotals.rejected_far} no_municipality=${matchTotals.no_municipality}; valid r1 matched ${(matchRate(matchTotals.matched_valid, matchTotals.total_valid) * 100).toFixed(2)}%; municipalities below ${MIN_MATCH_RATE * 100}%: ${munBelow} of ${munMatch.size}`,
  );
  if (process.env.MATCH_REPORT) {
    const rows = [...munMatch].map(([id, mm]) => ({
      id,
      name: terr.get(id)?.name,
      rate: matchRate(mm.matched_valid, mm.total_valid),
      ...mm,
    }));
    writeFileSync(process.env.MATCH_REPORT, JSON.stringify(rows), 'utf8');
  }
}

const PRES_NOTE =
  'Comparação entre Lula (13) em 2022 e 2026 e entre Jair Bolsonaro (22, 2022) e Flávio Bolsonaro (22, 2026); diferenças não indicam transferência de votos. 2022: TSE, dados abertos.';

function presidentComparison(
  t: TerritoryAgg,
  tv: Map<number, number>,
  valid2026: number | null,
): PresidentialComparison | null {
  if (!tse2022 || YEAR !== 2026 || ROUND !== 1) return null;
  const v26 = (k: 'lula' | 'bolsonaro') => {
    const c = pres2026[k];
    return c && valid2026 !== null ? (tv.get(c.id) ?? 0) : null;
  };
  const entries = (r1: PresVotes | null, r2: PresVotes | null) =>
    (['lula', 'bolsonaro'] as const).map((k) => buildEntry(k, r1, r2, v26(k), valid2026));
  if (t.type === 'state')
    return {
      precision: 'exact',
      entries: entries(tse2022.state_mg.r1, tse2022.state_mg.r2),
      note: PRES_NOTE,
    };
  if (t.type === 'municipality') {
    const m = tse2022.municipalities[tseCdByMunId.get(t.id) ?? ''];
    if (!m)
      return {
        precision: 'unavailable',
        entries: entries(null, null),
        note: 'Município sem linha no arquivo do TSE de 2022.',
      };
    return { precision: 'exact', entries: entries(m.r1, m.r2), note: PRES_NOTE };
  }
  const mm = munMatch.get(t.parent_id!);
  const rate = mm ? matchRate(mm.matched_valid, mm.total_valid) : 0;
  if (!mm || rate < MIN_MATCH_RATE)
    return {
      precision: 'unavailable',
      entries: entries(null, null),
      note: `2022 por bairro indisponível neste município: só ${(rate * 100).toFixed(1).replace('.', ',')} % dos votos válidos de 2022 puderam ser associados a bairros (mínimo ${MIN_MATCH_RATE * 100} %).`,
    };
  const a = nb2022.get(t.id);
  if (!a)
    return {
      precision: 'unavailable',
      entries: entries(null, null),
      note: 'Nenhum local de votação de 2022 associado a este bairro.',
    };
  return {
    precision: 'approximate',
    entries: entries(a.r1, a.r2),
    note: `Aproximação: 2022 soma ${a.places} local(is) de votação de 2022 associados a este bairro pelo número do local ou pelo bairro do endereço. ${PRES_NOTE}`,
  };
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
      if (isTechnicalNull(c)) {
        // "Candidatura" sem nome de urna e sem partido: o TSE contabiliza esses votos como
        // nulos técnicos. Não listamos como candidatura; os totais da fonte não são alterados.
        warnings.push(
          `${office}: ${v} voto(s) registrados no número ${c.numero} sem candidatura válida (nulo técnico no TSE); não listados como candidatura.`,
        );
        continue;
      }
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
        has_history: false,
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
  /* comparison_2022 (tracked candidacies) is kept empty since rodada 3. */
  const presCmp = presidentComparison(t, tv, validByOffice.president ?? null);
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
    comparison_2022: [],
    president_comparison: presCmp,
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
    .filter((c) => c.tipo === 'nominal' && !isTechnicalNull(c))
    .map((c) => ({
      candidate_id: String(c.id),
      ballot_name: c.nm_urna ?? `Nº ${c.numero}`,
      party: c.sg_partido ?? '',
      number: c.numero,
      office: CARGO_TO_OFFICE[c.cd_cargo] as OfficeCode,
      year: YEAR,
      has_history: false,
      has_layer: [1, 3, 5].includes(c.cd_cargo),
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
  symmetric = false,
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
    domain: symmetric ? symmetricDomain(Object.values(values)) : [round4(lo), round4(hi)],
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
}
// presidential 2022 -> 2026 comparison layers (delta_pp_r1, municipality level, diverging domain)
if (tse2022 && YEAR === 2026 && ROUND === 1)
  for (const key of ['lula', 'bolsonaro'] as const)
    layer(
      'president_comparison',
      'pp',
      key,
      (m) => m.president_comparison?.entries.find((e) => e.key === key)?.delta_pp_r1 ?? null,
      true,
    );

// highlights ("por que Minas decide")
if (tse2022 && national2026 && YEAR === 2026 && ROUND === 1) {
  const st = metricsByTerritory.get('mg')!;
  const highlights: Highlights = buildHighlights({
    releaseId,
    municipalities: municipios.length,
    state2026: st,
    tse2022,
    national2026,
  });
  emit('highlights.json', highlights);
} else
  console.warn(
    '[build] WARNING: highlights.json not generated (TSE caches missing or not 2026 r1)',
  );

// methodology
const methodology: Methodology = {
  version: '1.1.0',
  language: 'pt-BR',
  summary: `Resultados do ${ROUND_LABEL} agregados a partir de locais de votação de Minas Gerais. Indicadores por município somam todos os locais do município; indicadores por bairro somam os locais cujo endereço informa aquele bairro.`,
  neighborhood_note:
    'O "bairro" é o bairro do endereço do local de votação, não a residência do eleitor. Eleitores de uma seção podem morar em outro bairro. Não há limites oficiais de bairro; a representação é por ponto (média das coordenadas dos locais).',
  comparison_note: tse2022
    ? `A comparação 2022 → 2026 é presidencial: Lula (PT, 13) em 2022 e em 2026, e Jair Bolsonaro (PL, 22) em 2022 frente a Flávio Bolsonaro (PL, 22) em 2026 — são pessoas diferentes; a comparação é entre as candidaturas do mesmo partido e número, e diferenças em pontos percentuais (participação nos votos válidos, 1º turno) ou em votos não indicam transferência de votos. Os números de 2022 vêm dos dados abertos do TSE (${tse2022.sources.map((x) => `${x.url.split('/').pop()}, Last-Modified ${x.last_modified}`).join('; ')}). Estado e municípios: valores exatos do TSE. Bairros: aproximação — os locais de votação de 2022 foram associados aos bairros de 2026 pelo número do local (mesma zona e município, até 1 km de distância) ou pelo nome do bairro do endereço; onde menos de 80 % dos votos válidos de 2022 do município puderam ser associados, o bairro fica sem comparação.`
    : 'Comparação 2022 → 2026 indisponível nesta versão (dados do TSE de 2022 não carregados).',
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
    ...(tse2022
      ? [
          {
            label: 'TSE — Dados Abertos, Eleições 2022 (Presidente)',
            note: tse2022.sources
              .map(
                (x) =>
                  `${x.url} [${x.entries.join(', ')}] (Last-Modified ${x.last_modified}; geração TSE ${x.generated_by_tse || 'n/d'})`,
              )
              .join('; '),
          },
        ]
      : []),
    ...(national2026
      ? [
          {
            label: 'TSE — Dados Abertos, Eleições 2026 (eleitorado por UF)',
            note: `${national2026.source.url} [${national2026.source.entries.join(', ')}] (Last-Modified ${national2026.source.last_modified}; geração TSE ${national2026.source.generated_by_tse})`,
          },
        ]
      : []),
  ],
  limitations: [
    ...(ROUND === 1 ? [`Sem 2º turno de ${YEAR} nesta versão.`] : []),
    'Comparação 2022 → 2026 apenas para Presidente (Lula e Jair/Flávio Bolsonaro), 1º turno; o 2º turno de 2022 é exibido como referência.',
    'Bairro 2022 é aproximado (associação de locais de votação de 2022 a bairros de 2026); locais não associados são descartados e contados, por isso a soma dos bairros não reproduz o município em 2022.',
    'Para Deputado Federal e Estadual, exibe-se as 10 candidaturas mais votadas por território além das rastreadas; votos de legenda compõem os válidos mas não aparecem como candidaturas.',
    'A fonte exclui dos votos válidos os votos de candidaturas anuladas sub judice; por isso a soma dos votos de candidaturas pode superar os válidos (em Deputado Federal, 94.114 votos em MG, 0,75 %). As divergências são mantidas e sinalizadas, nunca corrigidas.',
    `${terr.get('mg')!.approxCount} locais de votação com coordenada aproximada.`,
    'Números votados sem candidatura válida (sem nome de urna nem partido na fonte) são contados pelo TSE como nulos técnicos; não aparecem como candidaturas e os totais da fonte não são alterados (diferença explicada entre comparecimento e válidos+brancos+nulos).',
    'Candidaturas com registro anulado sub judice têm seus votos somados na fonte mas excluídos dos válidos pelo TSE; a fonte não traz esse status, então a participação nos válidos dessas candidaturas pode ficar superestimada (ver docs/TSE_SAMPLE_REPORT.md).',
  ],
};
emit('methodology.json', methodology);

// manifest
let commit = process.env.PIPELINE_COMMIT ?? 'unknown';
try {
  if (!process.env.PIPELINE_COMMIT)
    commit = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
} catch {
  /* no commit yet */
}
const manifest: SnapshotManifest = {
  schema_version: 1,
  release_id: releaseId,
  status: isPartial ? 'partial' : 'validated',
  generated_at: new Date().toISOString(),
  years: tse2022 ? [2022, YEAR] : [YEAR],
  rounds: [ROUND],
  geographic_levels: ['state', 'municipality', 'neighborhood'],
  source_project_alias: 'electoral-source-readonly',
  source_tables: ['municipios', 'locais', 'totais_local', 'candidaturas', 'votos_cand'],
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
    'president_comparison_delta_pp_r1',
  ],
  files,
  methodology_version: methodology.version,
  coverage_notes: [
    isPartial
      ? `Cobertura parcial: apenas o município IBGE ${extractManifest.scope.ibge}.`
      : `Cobertura: ${municipios.length} municípios de Minas Gerais, ${locais.length} locais de votação.`,
    `Eleição ${YEAR}, ${ROUND}º turno; 2022 apenas para Presidente (Lula e Bolsonaro), a partir dos dados abertos do TSE${tse2022 ? '' : ' (não carregado nesta versão)'}.`,
    ...(tse2022
      ? [
          `Bairros 2022 (aproximados): ${matchTotals.places} locais de 2022; ${matchTotals.same_place} associados pelo número do local, ${matchTotals.bairro_name} pelo nome do bairro, ${matchTotals.none} descartados; ${((matchTotals.matched_valid / Math.max(1, matchTotals.total_valid)) * 100).toFixed(2)} % dos votos válidos de 2022 (1º turno) associados; ${munBelow} municípios abaixo de ${MIN_MATCH_RATE * 100} % (bairros sem comparação).`,
        ]
      : []),
  ],
  warnings: globalWarnings
    .slice(0, 200)
    .concat(globalWarnings.length > 200 ? [`… e mais ${globalWarnings.length - 200} avisos.`] : []),
};
mkdirSync(outRoot, { recursive: true });
const manifestText = JSON.stringify(manifest, null, 2);
// Per-release copy: releases coexist under public/data/<release>/; the root manifest.json is the
// pointer to the CURRENT release. Rollback = copy an older <release>/release-manifest.json over it.
writeFileSync(join(outDir, 'release-manifest.json'), manifestText, 'utf8');
if (ACTIVATE) writeFileSync(join(outRoot, 'manifest.json'), manifestText, 'utf8');
else
  console.log('[build] --no-activate: root manifest.json NOT updated (current release unchanged)');
const totalBytes = files.reduce((a, f) => a + f.bytes, 0);
console.log(
  `[build] wrote ${files.length} files (${(totalBytes / 1024 / 1024).toFixed(1)} MB) + manifest → ${outRoot} status=${manifest.status} warnings=${globalWarnings.length}`,
);

// ---------- helpers ----------
function isTechnicalNull(c: Candidatura) {
  return !c.nm_urna && !c.sg_partido;
}
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
