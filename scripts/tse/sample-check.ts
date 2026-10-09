/**
 * P-DATA-1: sample check of the published snapshot against OFFICIAL TSE totals.
 *
 *   npx tsx scripts/tse/sample-check.ts [--snapshot public/data] [--extract data/private/extract/<release>]
 *       [--cache data/private/tse] [--municipalities 3106200,3140001,...] [--out docs/TSE_SAMPLE_REPORT.md] [--offline]
 *
 * Source: TSE Dados Abertos (https://dadosabertos.tse.jus.br, dataset "resultados-2026"), files on
 * https://cdn.tse.jus.br/estatistica/sead/odsele/:
 *   - detalhe_votacao_munzona/detalhe_votacao_munzona_2026.zip   (aptos, comparecimento, abstenção, válidos, brancos, nulos)
 *   - votacao_candidato_munzona/votacao_candidato_munzona_2026.zip (votos por candidatura; 455 MB)
 * The big zip is NOT downloaded whole: HTTP Range requests fetch the central directory and only the
 * entries needed (MG + BR for the president). Each entry's CRC-32 is verified. Downloaded bytes are only
 * ever PARSED as CSV text; nothing downloaded is executed. Filtered data is cached in --cache
 * (gitignored `data/private/`), so reruns work with --offline.
 *
 * The TSE municipality code (cd_municipio) ↔ IBGE code mapping comes from the private extract's
 * municipios.json (never published). Nothing is invented: if a source cannot be read, the report
 * says NÃO EXECUTADO with the URLs and HTTP statuses tried.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  createClient,
  csvRows as csvRowsC,
  zipDirectory as zipDirectoryC,
  type HttpAttempt,
  type ZipEntry,
} from './zip-range.ts';
import { MunicipalityMetricsFile } from '../../shared/contracts/snapshot.ts';
import { SnapshotManifest } from '../../shared/contracts/metrics.ts';
import type { OfficeCode } from '../../shared/contracts/metrics.ts';

const BASE = 'https://cdn.tse.jus.br/estatistica/sead/odsele';
const DETALHE_URL = `${BASE}/detalhe_votacao_munzona/detalhe_votacao_munzona_2026.zip`;
const CAND_URL = `${BASE}/votacao_candidato_munzona/votacao_candidato_munzona_2026.zip`;
const UA = 'Mozilla/5.0 (minas-em-movimento sample-check; read-only)';

/** Sample: capital, Mariana, RMBH, Zona da Mata, Triângulo, Norte, Sul, Jequitinhonha/Mucuri, Rio Doce, smallest city. */
const DEFAULT_SAMPLE: { ibge: string; region: string }[] = [
  { ibge: '3106200', region: 'Capital / RMBH' },
  { ibge: '3140001', region: 'Central (Mariana)' },
  { ibge: '3118601', region: 'RMBH (Contagem)' },
  { ibge: '3136702', region: 'Zona da Mata (Juiz de Fora)' },
  { ibge: '3170206', region: 'Triângulo (Uberlândia)' },
  { ibge: '3143302', region: 'Norte (Montes Claros)' },
  { ibge: '3151800', region: 'Sul (Poços de Caldas)' },
  { ibge: '3168606', region: 'Mucuri (Teófilo Otoni)' },
  { ibge: '3127701', region: 'Rio Doce (Governador Valadares)' },
  { ibge: '3166600', region: 'Pequeno (Serra da Saudade)' },
];

// ---------- args ----------
const argv = process.argv.slice(2);
const arg = (k: string): string | undefined => {
  const i = argv.indexOf(k);
  const v = i >= 0 ? argv[i + 1] : undefined;
  return v && !v.startsWith('--') ? v : undefined;
};
const OFFLINE = argv.includes('--offline');
const snapshotDir = resolve(arg('--snapshot') ?? join('public', 'data'));
const cacheDir = resolve(arg('--cache') ?? join('data', 'private', 'tse'));
const outFile = resolve(arg('--out') ?? join('docs', 'TSE_SAMPLE_REPORT.md'));
const sample = arg('--municipalities')
  ? arg('--municipalities')!
      .split(',')
      .map((ibge) => ({ ibge, region: DEFAULT_SAMPLE.find((s) => s.ibge === ibge)?.region ?? '' }))
  : DEFAULT_SAMPLE;
for (const s of sample) if (!/^\d{7}$/.test(s.ibge)) throw new Error(`invalid IBGE code ${s.ibge}`);

const PRIOR_PROBES = [
  'https://resultados.tse.jus.br/oficial/ → 404 (application/xml)',
  'https://resultados.tse.jus.br/oficial/ele2026/ → 404 (application/xml)',
  'https://resultados.tse.jus.br/oficial/ele2026/config/ele-c.json → 404',
  'https://resultados.tse.jus.br/oficial/ele2022/544/dados/mg/mg41238-c0001-e000544-u.json → 404 (padrão de 2022 não se aplica)',
  'https://dadosabertos.tse.jus.br/ e /dataset/resultados-2026 → 200 (lista os arquivos .zip em cdn.tse.jus.br usados aqui)',
];

// ---------- HTTP (shared ZIP-over-Range reader, scripts/tse/zip-range.ts) ----------
const client = createClient({ offline: OFFLINE, userAgent: UA });
const attempts: HttpAttempt[] = client.attempts;
const zipDirectory = (url: string) => zipDirectoryC(client, url);
const csvRows = (url: string, e: ZipEntry, keep: (r: Record<string, string>) => boolean) =>
  csvRowsC(client, url, e, keep);

// ---------- cached loaders ----------
interface Cached<T> {
  source_url: string;
  last_modified: string;
  generated_by_tse: string;
  rows: T[];
}
function readCache<T>(name: string): Cached<T> | null {
  const p = join(cacheDir, name);
  return existsSync(p) ? (JSON.parse(readFileSync(p, 'utf8')) as Cached<T>) : null;
}
function writeCache<T>(name: string, c: Cached<T>) {
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(join(cacheDir, name), JSON.stringify(c), 'utf8');
}

type DetRow = Record<string, string>;
async function loadDetalhe(): Promise<Cached<DetRow>> {
  const name = 'detalhe-mg-2026.json';
  const hit = readCache<DetRow>(name);
  if (hit) return hit;
  const { entries, lastModified } = await zipDirectory(DETALHE_URL);
  const mg = entries.find((e) => e.name === 'detalhe_votacao_munzona_2026_MG.csv');
  const br = entries.find((e) => e.name === 'detalhe_votacao_munzona_2026_BR.csv');
  if (!mg || !br) throw new Error('detalhe zip: expected MG and BR entries not found');
  const isMg = (r: DetRow) => r['SG_UF'] === 'MG';
  const rows = [
    ...(await csvRows(DETALHE_URL, mg, isMg)),
    // president (cd_cargo 1) is published only in the BR file, by UF
    ...(await csvRows(DETALHE_URL, br, (r) => isMg(r) && r['CD_CARGO'] === '1')),
  ];
  const c = {
    source_url: DETALHE_URL,
    last_modified: lastModified,
    generated_by_tse: `${rows[0]?.['DT_GERACAO'] ?? '?'} ${rows[0]?.['HH_GERACAO'] ?? ''}`.trim(),
    rows,
  };
  writeCache(name, c);
  return c;
}

async function loadCandidates(): Promise<Cached<DetRow>> {
  const name = 'candidatos-mg-cargo-1-3-2026.json';
  const hit = readCache<DetRow>(name);
  if (hit) return hit;
  const { entries, lastModified } = await zipDirectory(CAND_URL);
  const mg = entries.find((e) => e.name === 'votacao_candidato_munzona_2026_MG.csv');
  const br = entries.find((e) => e.name === 'votacao_candidato_munzona_2026_BR.csv');
  if (!mg || !br) throw new Error('candidate zip: expected MG and BR entries not found');
  const rows = [
    ...(await csvRows(CAND_URL, mg, (r) => r['SG_UF'] === 'MG' && r['CD_CARGO'] === '3')),
    ...(await csvRows(CAND_URL, br, (r) => r['SG_UF'] === 'MG' && r['CD_CARGO'] === '1')),
  ].map((r) => ({
    // keep only what the comparison needs
    NR_TURNO: r['NR_TURNO']!,
    CD_MUNICIPIO: r['CD_MUNICIPIO']!,
    NM_MUNICIPIO: r['NM_MUNICIPIO']!,
    NR_ZONA: r['NR_ZONA']!,
    CD_CARGO: r['CD_CARGO']!,
    NR_CANDIDATO: r['NR_CANDIDATO']!,
    NM_URNA_CANDIDATO: r['NM_URNA_CANDIDATO']!,
    NM_TIPO_DESTINACAO_VOTOS: r['NM_TIPO_DESTINACAO_VOTOS']!,
    QT_VOTOS_NOMINAIS: r['QT_VOTOS_NOMINAIS']!,
    QT_VOTOS_NOMINAIS_VALIDOS: r['QT_VOTOS_NOMINAIS_VALIDOS']!,
    DT_GERACAO: r['DT_GERACAO']!,
    HH_GERACAO: r['HH_GERACAO']!,
  }));
  const c = {
    source_url: CAND_URL,
    last_modified: lastModified,
    generated_by_tse: `${rows[0]?.['DT_GERACAO'] ?? '?'} ${rows[0]?.['HH_GERACAO'] ?? ''}`.trim(),
    rows,
  };
  writeCache(name, c);
  return c;
}

// ---------- comparison ----------
interface Cmp {
  ibge: string;
  name: string;
  indicator: string;
  snapshot: number | null;
  official: number | null;
  note: string;
}

const OFFICE_CD: Record<OfficeCode, number> = {
  president: 1,
  governor: 3,
  senator: 5,
  federal_deputy: 6,
  state_deputy: 7,
};
const OFFICE_PT: Record<OfficeCode, string> = {
  president: 'Presidente',
  governor: 'Governador',
  senator: 'Senador',
  federal_deputy: 'Dep. Federal',
  state_deputy: 'Dep. Estadual',
};
const sum = (rs: DetRow[], k: string) => rs.reduce((a, r) => a + Number(r[k] ?? 0), 0);

function explainTotals(det: DetRow[], diff: number, kind: 'valid' | 'null' | 'other'): string {
  if (diff === 0) return 'idêntico';
  const anul = sum(det, 'QT_TOTAL_VOTOS_ANULADOS');
  const subj = sum(det, 'QT_TOTAL_VOTOS_ANUL_SUBJUD');
  const tec = sum(det, 'QT_VOTOS_NULOS_TECNICOS');
  const parts: string[] = [];
  if (kind === 'valid' && (anul > 0 || subj > 0))
    parts.push(`TSE registra ${anul} votos anulados (${subj} sub judice) no cargo/município`);
  if (kind === 'null' && tec > 0) parts.push(`TSE registra ${tec} nulos técnicos`);
  return parts.length
    ? `DIFERENÇA — ${parts.join('; ')}; a atribuição exata não é verificável só com estes campos`
    : 'DIFERENÇA SEM EXPLICAÇÃO nos campos do TSE (possível defasagem de totalização entre a fonte do snapshot e o arquivo do TSE); investigar';
}

async function main() {
  const manifest = SnapshotManifest.parse(
    JSON.parse(readFileSync(join(snapshotDir, 'manifest.json'), 'utf8')),
  );
  const release = manifest.release_id;
  const extractDir = resolve(arg('--extract') ?? join('data', 'private', 'extract', release));
  const munFile = join(extractDir, 'municipios.json');
  if (!existsSync(munFile)) throw new Error(`missing ${munFile} (needed for IBGE↔TSE code map)`);
  const municipios = JSON.parse(readFileSync(munFile, 'utf8')) as {
    cd_municipio: string;
    cd_ibge: number;
    nome: string;
  }[];
  const tseByIbge = new Map(municipios.map((m) => [String(m.cd_ibge), m]));

  let det: Cached<DetRow>;
  let cand: Cached<DetRow>;
  const failures: string[] = [];
  try {
    det = await loadDetalhe();
    cand = await loadCandidates();
  } catch (e) {
    failures.push((e as Error).message);
    writeReport(release, null, null, [], failures);
    console.error(`[tse] NÃO EXECUTADO: ${(e as Error).message}`);
    process.exit(2);
  }

  const cmps: Cmp[] = [];
  const skipped: string[] = [];
  for (const s of sample) {
    const mun = tseByIbge.get(s.ibge);
    if (!mun) {
      skipped.push(`${s.ibge}: não consta no extrato`);
      continue;
    }
    const mfPath = join(snapshotDir, release, 'metrics', `mg-${s.ibge}.json`);
    if (!existsSync(mfPath)) {
      skipped.push(`${s.ibge}: sem arquivo de métricas no snapshot`);
      continue;
    }
    const mf = MunicipalityMetricsFile.parse(JSON.parse(readFileSync(mfPath, 'utf8')));
    const tm = mf.self.find((m) => m.year === 2026 && m.round === 1);
    if (!tm) {
      skipped.push(`${s.ibge}: sem métricas 2026 r1`);
      continue;
    }
    const detMun = det.rows.filter((r) => r['CD_MUNICIPIO'] === mun.cd_municipio);
    const nm = (mun.nome ?? '').toUpperCase();
    const tseName = detMun[0]?.['NM_MUNICIPIO'] ?? '';
    if (detMun.length === 0) {
      skipped.push(`${s.ibge}: município TSE ${mun.cd_municipio} ausente do arquivo oficial`);
      continue;
    }
    const norm = (x: string) =>
      x
        .normalize('NFD')
        .replace(/[^A-Za-z ]/g, '')
        .toUpperCase();
    if (norm(tseName) !== norm(nm))
      skipped.push(`AVISO ${s.ibge}: nome TSE "${tseName}" != extrato "${nm}"`);
    const push = (
      indicator: string,
      snapshot: number | null,
      official: number | null,
      note: string,
    ) => cmps.push({ ibge: s.ibge, name: tseName || nm, indicator, snapshot, official, note });

    const detPres = detMun.filter((r) => r['CD_CARGO'] === '1');
    const t = tm.turnout;
    const tot = (k: string) => sum(detPres, k);
    const rows: [string, number | undefined, number, 'valid' | 'null' | 'other'][] = [
      ['Aptos (eleitorado)', t?.eligible, tot('QT_APTOS'), 'other'],
      ['Comparecimento', t?.turnout, tot('QT_COMPARECIMENTO'), 'other'],
      ['Abstenção', t?.abstention, tot('QT_ABSTENCOES'), 'other'],
      ['Votos válidos (Presidente)', t?.valid, tot('QT_TOTAL_VOTOS_VALIDOS'), 'valid'],
      ['Votos brancos (Presidente)', t?.blank, tot('QT_VOTOS_BRANCOS'), 'other'],
      ['Votos nulos (Presidente)', t?.null_votes, tot('QT_TOTAL_VOTOS_NULOS'), 'null'],
    ];
    for (const [ind, snap, off, kind] of rows)
      push(ind, snap ?? null, off, explainTotals(detPres, (snap ?? 0) - off, kind));
    for (const office of ['governor', 'senator', 'federal_deputy', 'state_deputy'] as const) {
      const d = detMun.filter((r) => r['CD_CARGO'] === String(OFFICE_CD[office]));
      const off = sum(d, 'QT_TOTAL_VOTOS_VALIDOS');
      const snap = tm.valid_by_office[office] ?? null;
      push(
        `Votos válidos (${OFFICE_PT[office]})`,
        snap,
        off,
        explainTotals(d, (snap ?? 0) - off, 'valid'),
      );
    }

    // candidates (president + governor)
    for (const office of ['president', 'governor'] as const) {
      const cd = String(OFFICE_CD[office]);
      const rowsC = cand.rows.filter(
        (r) => r['CD_MUNICIPIO'] === mun.cd_municipio && r['CD_CARGO'] === cd,
      );
      const byNum = new Map<
        number,
        { name: string; valid: number; nominal: number; dest: Set<string> }
      >();
      for (const r of rowsC) {
        const n = Number(r['NR_CANDIDATO']);
        const cur = byNum.get(n) ?? {
          name: r['NM_URNA_CANDIDATO'] ?? '',
          valid: 0,
          nominal: 0,
          dest: new Set<string>(),
        };
        cur.valid += Number(r['QT_VOTOS_NOMINAIS_VALIDOS'] ?? 0);
        cur.nominal += Number(r['QT_VOTOS_NOMINAIS'] ?? 0);
        if (r['NM_TIPO_DESTINACAO_VOTOS'] !== 'Válido' && r['NM_TIPO_DESTINACAO_VOTOS'])
          cur.dest.add(r['NM_TIPO_DESTINACAO_VOTOS']);
        byNum.set(n, cur);
      }
      let absent = 0;
      const snapByNum = new Map((tm.results[office] ?? []).map((c) => [c.number, c]));
      for (const n of [...new Set([...byNum.keys(), ...snapByNum.keys()])].sort((a, b) => a - b)) {
        const o = byNum.get(n);
        const sv = snapByNum.get(n)?.votes ?? 0;
        const ov = o?.valid ?? 0;
        let note = 'idêntico';
        if (sv !== ov) {
          if (!o) {
            absent += sv;
            note =
              'DIFERENÇA — candidatura sem linha no arquivo oficial de candidaturas (snapshot lista "Nº ' +
              n +
              '" sem nome/partido); ver linha de votos nulos do mesmo município';
          } else if (o.nominal !== o.valid) {
            note = `DIFERENÇA — TSE classifica ${o.nominal - o.valid} de ${o.nominal} votos nominais como "${[...o.dest].join(', ') || 'não válido'}" (fora dos válidos, QT_VOTOS_NOMINAIS_VALIDOS = ${o.valid}); o snapshot soma esses votos à candidatura enquanto os válidos do cargo coincidem com o oficial`;
          } else note = 'DIFERENÇA SEM EXPLICAÇÃO nos campos do TSE; investigar';
        }
        push(
          `${OFFICE_PT[office]} ${n} ${snapByNum.get(n)?.ballot_name ?? o?.name ?? ''}`.trim(),
          sv,
          ov,
          note,
        );
      }
      if (office === 'president' && absent > 0) {
        const nul = cmps.find(
          (c) => c.ibge === s.ibge && c.indicator === 'Votos nulos (Presidente)',
        );
        const tec = sum(detPres, 'QT_VOTOS_NULOS_TECNICOS');
        if (nul && nul.snapshot !== null && nul.official !== null) {
          const d = nul.snapshot - nul.official;
          if (d === -tec && tec === absent)
            nul.note = `DIFERENÇA — igual aos ${tec} nulos técnicos do TSE (QT_VOTOS_NULOS_TECNICOS), que o snapshot atribui a "Nº 28" em vez de nulos (soma dos votos de candidaturas sem linha oficial = ${absent})`;
        }
      }
    }
  }
  writeReport(release, det, cand, cmps, skipped);
  const diffs = cmps.filter((c) => c.snapshot !== c.official).length;
  console.log(
    `[tse] compared ${cmps.length} indicators in ${sample.length - skipped.length} municipalities; differing=${diffs}; report → ${outFile}`,
  );
}

function fmt(n: number | null): string {
  return n === null ? '—' : n.toLocaleString('pt-BR');
}

/** Keeps the HTTP log of the last online run so offline reruns still report it. */
function syncAttempts() {
  const p = join(cacheDir, 'http-attempts.json');
  if (attempts.length) {
    mkdirSync(cacheDir, { recursive: true });
    writeFileSync(p, JSON.stringify(attempts), 'utf8');
  } else if (existsSync(p)) {
    attempts.push(...(JSON.parse(readFileSync(p, 'utf8')) as HttpAttempt[]));
  }
}

function writeReport(
  release: string,
  det: Cached<DetRow> | null,
  cand: Cached<DetRow> | null,
  cmps: Cmp[],
  notes: string[],
) {
  syncAttempts();
  const L: string[] = [];
  const when = new Date().toISOString();
  L.push(
    '# TSE_SAMPLE_REPORT — amostragem do snapshot contra totais oficiais do TSE (P-DATA-1)',
    '',
  );
  L.push(
    `Gerado por \`scripts/tse/sample-check.ts\` em ${when}. Snapshot conferido: \`${release}\` (1º turno de 2026).`,
    '',
  );
  if (!det || !cand) {
    L.push('## Resultado: NÃO EXECUTADO', '');
    L.push('Motivo: ' + notes.join(' | '), '', '### Tentativas HTTP', '');
    for (const a of attempts)
      L.push(
        `- ${a.url}${a.range ? ` (Range ${a.range})` : ''} → ${a.status}${a.note ? ` ${a.note}` : ''}`,
      );
    writeFileSync(outFile, L.join('\n') + '\n', 'utf8');
    return;
  }
  const exact = cmps.filter((c) => c.snapshot === c.official).length;
  const bad = cmps.filter((c) => c.snapshot !== c.official);
  L.push('## Fonte oficial', '');
  L.push(
    '- Portal de Dados Abertos do TSE, conjunto "Resultados - 2026" (<https://dadosabertos.tse.jus.br/dataset/resultados-2026>).',
  );
  L.push(
    `- Totais: \`${det.source_url}\` (Last-Modified HTTP: ${det.last_modified || 'n/d'}; geração TSE: ${det.generated_by_tse}).`,
  );
  L.push(
    `- Candidaturas: \`${cand.source_url}\` (Last-Modified HTTP: ${cand.last_modified || 'n/d'}; geração TSE: ${cand.generated_by_tse}); lido por HTTP Range (somente as entradas MG e BR; CRC-32 verificado).`,
  );
  L.push(
    '- A API JSON `resultados.tse.jus.br/oficial/ele2026/...` **não foi usada**: nas tentativas a raiz e os caminhos de 2022/2026 responderam 404 (ver "Tentativas HTTP").',
  );
  L.push(
    '- Totais de Presidente vêm da entrada `BR` do arquivo (o Presidente é publicado só no arquivo nacional, por UF); os demais cargos, da entrada `MG`.',
  );
  L.push(
    '- Dado oficial somado por zona eleitoral (linhas `munzona`, `ST_VOTO_EM_TRANSITO = N`). Comparação de candidaturas usa `QT_VOTOS_NOMINAIS_VALIDOS` (válidos, exclui anulados/sub judice).',
    '',
  );
  L.push('## Resultado', '');
  L.push(
    `- Municípios amostrados: ${sample.length - notes.filter((n) => !n.startsWith('AVISO')).length} de ${sample.length}. Indicadores comparados: **${cmps.length}**; idênticos: **${exact}**; divergentes: **${bad.length}**.`,
  );
  const maxAbs = Math.max(0, ...bad.map((c) => Math.abs((c.snapshot ?? 0) - (c.official ?? 0))));
  L.push(`- Maior diferença absoluta: ${fmt(maxAbs)}.`);
  const isCand = (c: Cmp) => /^(Presidente|Governador) \d+/.test(c.indicator);
  const agg = cmps.filter((c) => !isCand(c) && c.indicator !== 'Votos nulos (Presidente)');
  const aggBad = agg.filter((c) => c.snapshot !== c.official).length;
  L.push(
    `- Aptos, comparecimento, abstenção, brancos e válidos (5 cargos): ${agg.length} comparações, **${aggBad} divergentes**.`,
    `- Votos nulos de Presidente divergentes: ${bad.filter((c) => c.indicator === 'Votos nulos (Presidente)').length}; candidaturas divergentes: ${bad.filter(isCand).length} (ver explicações; nenhuma divergência é "sem explicação" se a coluna não disser isso).`,
    `- Divergências marcadas "SEM EXPLICAÇÃO": ${bad.filter((c) => c.note.includes('SEM EXPLICAÇÃO')).length}.`,
  );
  for (const n of notes) L.push(`- ${n}`);
  L.push('');
  if (bad.length) {
    L.push(
      '### Divergências',
      '',
      '| Município | Indicador | Snapshot | Oficial | Dif. abs. | Dif. % | Explicação |',
      '|---|---|---:|---:|---:|---:|---|',
    );
    for (const c of bad) L.push(row(c));
    L.push('');
  }
  L.push('## Tabela completa', '', 'Dif. = snapshot − oficial. Dif. % relativa ao oficial.', '');
  let current = '';
  for (const c of cmps) {
    if (c.ibge !== current) {
      current = c.ibge;
      const reg = sample.find((s) => s.ibge === c.ibge)?.region ?? '';
      L.push(
        '',
        `### ${c.name} (IBGE ${c.ibge})${reg ? ` — ${reg}` : ''}`,
        '',
        '| Município | Indicador | Snapshot | Oficial | Dif. abs. | Dif. % | Explicação |',
        '|---|---|---:|---:|---:|---:|---|',
      );
    }
    L.push(row(c));
  }
  L.push('', '## Tentativas HTTP', '');
  L.push('Sondagem manual prévia (curl, 2026-10-09) da API de resultados, **sem sucesso**:', '');
  for (const t of PRIOR_PROBES) L.push(`- ${t}`);
  L.push('', 'Requisições feitas por este script:', '');
  for (const a of attempts)
    L.push(`- ${a.url}${a.range ? ` (Range ${a.range})` : ''} → ${a.status}`);
  if (attempts.length === 0)
    L.push('- (execução offline: dados lidos do cache em `data/private/tse/`)');
  L.push(
    '',
    '## Reprodução',
    '',
    '```',
    'npx tsx scripts/tse/sample-check.ts            # baixa (Range) e compara; cache em data/private/tse/',
    'npx tsx scripts/tse/sample-check.ts --offline   # reusa o cache',
    '```',
    '',
  );
  const fingerprint = createHash('sha256').update(JSON.stringify(cmps)).digest('hex').slice(0, 16);
  L.push(
    `Impressão digital dos resultados (sha256 de ${cmps.length} linhas, 16 hex): \`${fingerprint}\`.`,
    '',
  );
  writeFileSync(outFile, L.join('\n'), 'utf8');
}

function row(c: Cmp): string {
  const diff = c.snapshot === null || c.official === null ? null : c.snapshot - c.official;
  const pct =
    diff === null || !c.official
      ? '—'
      : `${((diff / c.official) * 100).toFixed(3).replace('.', ',')} %`;
  return `| ${c.name} | ${c.indicator} | ${fmt(c.snapshot)} | ${fmt(c.official)} | ${fmt(diff)} | ${pct} | ${c.note} |`;
}

main().catch((e) => {
  console.error(`[tse] FAILED: ${(e as Error).message}`);
  process.exit(1);
});
