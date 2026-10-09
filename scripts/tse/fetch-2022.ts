/**
 * Rodada 3: download the 2022 presidential results (and the 2026 national context) from TSE open data.
 *
 *   npm run tse:2022 [-- --cache data/private/tse] [--offline] [--force] [--skip-sections]
 *
 * Sources (https://cdn.tse.jus.br/estatistica/sead/odsele/, Dados Abertos do TSE):
 *   - votacao_candidato_munzona/votacao_candidato_munzona_2022.zip  entries _MG and _BR (president is in _BR)
 *   - detalhe_votacao_munzona/detalhe_votacao_munzona_2022.zip      entries _MG and _BR
 *   - votacao_secao/votacao_secao_2022_BR.zip                       polling-section votes, president (SG_UF = MG)
 *     (votacao_secao_2022_MG.zip was tried first: 6,285,638 lines, none for CD_CARGO 1 — state offices only)
 *   - eleitorado_locais_votacao/eleitorado_local_votacao_2022.zip   polling places (NM_BAIRRO, lat/lon), MG rows
 *   - detalhe_votacao_munzona/detalhe_votacao_munzona_2026.zip      entry _BR: eligible per UF (ranking/share)
 *
 * Read with HTTP Range (scripts/tse/zip-range.ts): only the needed entries, CRC-32 verified, parsed as CSV
 * text only. Filtered intermediates are cached under <cache>/2022/ and <cache>/2026/ (gitignored), so reruns
 * are offline. Output: <cache>/2022/president-2022.json (President2022File) and
 * <cache>/2026/national-2026.json (National2026File). Nothing here touches the legacy database.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  createClient,
  entryLines,
  forEachCsvRow,
  splitCsv,
  zipDirectory,
  type ZipEntry,
} from './zip-range.ts';
import {
  addInto,
  emptyRound,
  emptyVotes,
  localKey,
  type Local2022,
  type National2026File,
  type PresRound,
  type PresVotes,
  type President2022File,
  type SourceRecord,
} from './president-2022.ts';

const BASE = 'https://cdn.tse.jus.br/estatistica/sead/odsele';
const URLS = {
  cand: `${BASE}/votacao_candidato_munzona/votacao_candidato_munzona_2022.zip`,
  det: `${BASE}/detalhe_votacao_munzona/detalhe_votacao_munzona_2022.zip`,
  /** president section votes are only in the _BR archive (the _MG one has state offices only) */
  secao: `${BASE}/votacao_secao/votacao_secao_2022_BR.zip`,
  secaoMg: `${BASE}/votacao_secao/votacao_secao_2022_MG.zip`,
  eleit: `${BASE}/eleitorado_locais_votacao/eleitorado_local_votacao_2022.zip`,
  det26: `${BASE}/detalhe_votacao_munzona/detalhe_votacao_munzona_2026.zip`,
};

const argv = process.argv.slice(2);
const arg = (k: string): string | undefined => {
  const i = argv.indexOf(k);
  const v = i >= 0 ? argv[i + 1] : undefined;
  return v && !v.startsWith('--') ? v : undefined;
};
const OFFLINE = argv.includes('--offline');
const FORCE = argv.includes('--force');
const SKIP_SECTIONS = argv.includes('--skip-sections');
const cacheRoot = resolve(arg('--cache') ?? join('data', 'private', 'tse'));
const dir22 = join(cacheRoot, '2022');
const dir26 = join(cacheRoot, '2026');
mkdirSync(dir22, { recursive: true });
mkdirSync(dir26, { recursive: true });

const client = createClient({ offline: OFFLINE });
const log = (m: string) => console.log(`[tse:2022] ${m}`);
const num = (s: string | undefined) => {
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};

interface Cached<T> {
  source: SourceRecord;
  data: T;
}
function cached<T>(file: string, build: () => Promise<Cached<T>>): Promise<Cached<T>> {
  const p = join(file);
  if (!FORCE && existsSync(p)) {
    log(`cache hit ${p}`);
    return Promise.resolve(JSON.parse(readFileSync(p, 'utf8')) as Cached<T>);
  }
  return build().then((c) => {
    writeFileSync(p, JSON.stringify(c), 'utf8');
    log(`cached → ${p}`);
    return c;
  });
}

async function dir(url: string, names: string[]) {
  const d = await zipDirectory(client, url);
  const found = names.map((n) => d.entries.find((e) => e.name === n));
  const missing = names.filter((_, i) => !found[i]);
  if (missing.length) throw new Error(`${url}: entries not found: ${missing.join(', ')}`);
  log(`${url.split('/').pop()} Last-Modified ${d.lastModified} (${d.totalBytes} bytes)`);
  return { entries: found as ZipEntry[], lastModified: d.lastModified };
}
const gen = (r: Record<string, string>) =>
  `${r['DT_GERACAO'] ?? '?'} ${r['HH_GERACAO'] ?? ''}`.trim();

// ---------- detalhe 2022 (president, all UFs, by municipality/zone) ----------
type DetRow = {
  t: number;
  uf: string;
  mun: string;
  name: string;
  transit: string;
  aptos: number;
  comp: number;
  abst: number;
  valid: number;
  blank: number;
  nulls: number;
  tech: number;
};
const detalhe = () =>
  cached<{ rows: DetRow[]; mg_entry_cargo1_rows: number }>(
    join(dir22, 'detalhe-presidente-2022.json'),
    async () => {
      const names = ['detalhe_votacao_munzona_2022_MG.csv', 'detalhe_votacao_munzona_2022_BR.csv'];
      const { entries, lastModified } = await dir(URLS.det, names);
      let g = '';
      let mgCargo1 = 0;
      await forEachCsvRow(client, URLS.det, entries[0]!, (r) => {
        if (r['CD_CARGO'] === '1') mgCargo1++;
      });
      const rows: DetRow[] = [];
      await forEachCsvRow(client, URLS.det, entries[1]!, (r) => {
        if (r['CD_CARGO'] !== '1') return;
        g ||= gen(r);
        rows.push({
          t: num(r['NR_TURNO']),
          uf: r['SG_UF']!,
          mun: String(num(r['CD_MUNICIPIO'])),
          name: r['NM_MUNICIPIO']!,
          transit: r['ST_VOTO_EM_TRANSITO']!,
          aptos: num(r['QT_APTOS']),
          comp: num(r['QT_COMPARECIMENTO']),
          abst: num(r['QT_ABSTENCOES']),
          valid: num(r['QT_TOTAL_VOTOS_VALIDOS']),
          blank: num(r['QT_VOTOS_BRANCOS']),
          nulls: num(r['QT_TOTAL_VOTOS_NULOS']),
          tech: num(r['QT_VOTOS_NULOS_TECNICOS']),
        });
      });
      return {
        source: {
          key: 'detalhe_votacao_munzona_2022',
          url: URLS.det,
          entries: names,
          last_modified: lastModified,
          generated_by_tse: g,
          note: `Presidente (CD_CARGO 1) lido da entrada _BR; a entrada _MG tem ${mgCargo1} linhas de Presidente.`,
        },
        data: { rows, mg_entry_cargo1_rows: mgCargo1 },
      };
    },
  );

// ---------- votacao_candidato 2022 (president 13 and 22, all UFs) ----------
type CandRow = {
  t: number;
  uf: string;
  mun: string;
  nr: number;
  name: string;
  party: string;
  nominal: number;
  valid: number;
};
const candidatos = () =>
  cached<{ rows: CandRow[]; mg_entry_cargo1_rows: number }>(
    join(dir22, 'candidato-presidente-2022.json'),
    async () => {
      const names = [
        'votacao_candidato_munzona_2022_MG.csv',
        'votacao_candidato_munzona_2022_BR.csv',
      ];
      const { entries, lastModified } = await dir(URLS.cand, names);
      let g = '';
      let mgCargo1 = 0;
      log(
        'reading votacao_candidato_munzona_2022_MG.csv (~66 MB compressed) to confirm it has no president rows',
      );
      await forEachCsvRow(client, URLS.cand, entries[0]!, (r) => {
        if (r['CD_CARGO'] === '1') mgCargo1++;
      });
      const rows: CandRow[] = [];
      await forEachCsvRow(client, URLS.cand, entries[1]!, (r) => {
        if (r['CD_CARGO'] !== '1') return;
        const nr = num(r['NR_CANDIDATO']);
        if (nr !== 13 && nr !== 22) return;
        g ||= gen(r);
        rows.push({
          t: num(r['NR_TURNO']),
          uf: r['SG_UF']!,
          mun: String(num(r['CD_MUNICIPIO'])),
          nr,
          name: r['NM_URNA_CANDIDATO']!,
          party: r['SG_PARTIDO']!,
          nominal: num(r['QT_VOTOS_NOMINAIS']),
          valid: num(r['QT_VOTOS_NOMINAIS_VALIDOS']),
        });
      });
      return {
        source: {
          key: 'votacao_candidato_munzona_2022',
          url: URLS.cand,
          entries: names,
          last_modified: lastModified,
          generated_by_tse: g,
          note: `Presidente lido da entrada _BR (QT_VOTOS_NOMINAIS_VALIDOS); a entrada _MG tem ${mgCargo1} linhas de Presidente.`,
        },
        data: { rows, mg_entry_cargo1_rows: mgCargo1 },
      };
    },
  );

// ---------- detalhe 2026 BR (eligible per UF, round 1) ----------
const national2026 = () =>
  cached<National2026File['by_uf']>(join(dir26, 'detalhe-br-presidente-2026.json'), async () => {
    const names = ['detalhe_votacao_munzona_2026_BR.csv'];
    const { entries, lastModified } = await dir(URLS.det26, names);
    let g = '';
    const byUf: National2026File['by_uf'] = {};
    await forEachCsvRow(client, URLS.det26, entries[0]!, (r) => {
      if (r['CD_CARGO'] !== '1' || r['NR_TURNO'] !== '1') return;
      g ||= gen(r);
      const u = (byUf[r['SG_UF']!] ??= { eligible: 0, turnout: 0 });
      u.eligible += num(r['QT_APTOS']);
      u.turnout += num(r['QT_COMPARECIMENTO']);
    });
    return {
      source: {
        key: 'detalhe_votacao_munzona_2026',
        url: URLS.det26,
        entries: names,
        last_modified: lastModified,
        generated_by_tse: g,
      },
      data: byUf,
    };
  });

// ---------- eleitorado_local 2022 (MG polling places) ----------
type Place = {
  mun: string;
  zona: number;
  local: number;
  name: string;
  bairro: string;
  lat: number | null;
  lon: number | null;
};
const coord = (s: string | undefined) => {
  const n = Number(s);
  return Number.isFinite(n) && n !== -1 && n !== 0 ? n : null;
};
const places2022 = () =>
  cached<{ places: Record<string, Place>; rows: number; conflicting_bairro: number }>(
    join(dir22, 'locais-mg-2022.json'),
    async () => {
      const names = ['eleitorado_local_votacao_2022.csv'];
      const { entries, lastModified } = await dir(URLS.eleit, names);
      let g = '';
      let rows = 0;
      let conflicts = 0;
      const places: Record<string, Place> = {};
      await forEachCsvRow(client, URLS.eleit, entries[0]!, (r) => {
        if (r['SG_UF'] !== 'MG' || r['NR_TURNO'] !== '1') return;
        g ||= gen(r);
        rows++;
        const zona = num(r['NR_ZONA']);
        const local = num(r['NR_LOCAL_VOTACAO']);
        const k = localKey(r['CD_MUNICIPIO']!, zona, local);
        const cur = places[k];
        if (cur) {
          if (cur.bairro !== (r['NM_BAIRRO'] ?? '')) conflicts++;
          return;
        }
        places[k] = {
          mun: String(num(r['CD_MUNICIPIO'])),
          zona,
          local,
          name: r['NM_LOCAL_VOTACAO'] ?? '',
          bairro: r['NM_BAIRRO'] ?? '',
          lat: coord(r['NR_LATITUDE']),
          lon: coord(r['NR_LONGITUDE']),
        };
      });
      return {
        source: {
          key: 'eleitorado_local_votacao_2022',
          url: URLS.eleit,
          entries: names,
          last_modified: lastModified,
          generated_by_tse: g,
          note: 'Linhas SG_UF = MG, NR_TURNO = 1; uma linha por seção, agregadas por (município, zona, local).',
        },
        data: { places, rows, conflicting_bairro: conflicts },
      };
    },
  );

// ---------- votacao_secao 2022 MG (president, aggregated by polling place) ----------
type SecAgg = Record<string, { r1: PresVotes; r2: PresVotes }>;
const NON_VALID = new Set([95, 96, 97, 98]);
const sections = () =>
  cached<{ locals: SecAgg; votavel: Record<string, number>; lines: number }>(
    join(dir22, 'secao-presidente-mg-2022.json'),
    async () => {
      const names = ['votacao_secao_2022_BR.csv'];
      const { entries, lastModified } = await dir(URLS.secao, names);
      log(
        'streaming votacao_secao_2022_BR.csv (~271 MB compressed, ~1.6 GB CSV, all UFs); this takes a few minutes',
      );
      let header: string[] | null = null;
      let ix: Record<string, number> = {};
      let g = '';
      let lines = 0;
      const locals: SecAgg = {};
      const votavel: Record<string, number> = {};
      for await (const line of entryLines(client, URLS.secao, entries[0]!)) {
        if (!line) continue;
        if (!header) {
          header = splitCsv(line);
          ix = Object.fromEntries(header.map((h, i) => [h, i]));
          continue;
        }
        lines++;
        if (lines % 2_000_000 === 0) log(`  ${lines.toLocaleString('pt-BR')} linhas`);
        const c = splitCsv(line);
        if (c[ix['CD_CARGO']!] !== '1' || c[ix['SG_UF']!] !== 'MG') continue;
        if (!g) g = `${c[ix['DT_GERACAO']!]} ${c[ix['HH_GERACAO']!]}`;
        const t = c[ix['NR_TURNO']!] === '2' ? 'r2' : 'r1';
        const nr = num(c[ix['NR_VOTAVEL']!]);
        const q = num(c[ix['QT_VOTOS']!]);
        const vk = `${t}|${nr}|${c[ix['NM_VOTAVEL']!]}`;
        votavel[vk] = (votavel[vk] ?? 0) + q;
        const k = localKey(
          c[ix['CD_MUNICIPIO']!]!,
          num(c[ix['NR_ZONA']!]),
          num(c[ix['NR_LOCAL_VOTACAO']!]),
        );
        const a = (locals[k] ??= { r1: emptyVotes(), r2: emptyVotes() });
        const v = a[t];
        if (!NON_VALID.has(nr)) v.valid += q;
        if (nr === 13) v.lula += q;
        if (nr === 22) v.bolsonaro += q;
      }
      return {
        source: {
          key: 'votacao_secao_2022_BR',
          url: URLS.secao,
          entries: names,
          last_modified: lastModified,
          generated_by_tse: g,
          note: `SG_UF = MG, CD_CARGO = 1; válidos = QT_VOTOS com NR_VOTAVEL fora de 95 (branco), 96 (nulo), 97, 98. O arquivo ${URLS.secaoMg} foi lido antes e não contém Presidente.`,
        },
        data: { locals, votavel, lines },
      };
    },
  );

// ---------- compose ----------
async function main() {
  const det = await detalhe();
  const cand = await candidatos();
  const nat26 = await national2026();
  const checks: string[] = [];

  const municipalities: President2022File['municipalities'] = {};
  const national = { r1: emptyRound(), r2: emptyRound() };
  const stateMg = { r1: emptyRound(), r2: emptyRound() };
  const byUf: President2022File['by_uf_r1'] = {};
  let transitRows = 0;
  for (const r of det.data.rows) {
    const t = r.t === 2 ? 'r2' : 'r1';
    if (r.transit === 'S') transitRows++;
    const add: PresRound = {
      ...emptyRound(),
      eligible: r.aptos,
      turnout: r.comp,
      abstention: r.abst,
      valid: r.valid,
      blank: r.blank,
      null_votes: r.nulls,
    };
    addInto(national[t], add);
    if (t === 'r1') {
      const u = (byUf[r.uf] ??= { eligible: 0, turnout: 0 });
      u.eligible += r.aptos;
      u.turnout += r.comp;
    }
    if (r.uf !== 'MG') continue;
    addInto(stateMg[t], add);
    const m = (municipalities[r.mun] ??= { name: r.name, r1: emptyRound(), r2: emptyRound() });
    addInto(m[t], add);
  }
  checks.push(
    `detalhe 2022: ${det.data.rows.length} linhas de Presidente (todas as UFs), ${transitRows} com ST_VOTO_EM_TRANSITO = S (somadas, como na conferência de 2026).`,
  );
  let nominalNotValid = 0;
  for (const r of cand.data.rows) {
    const t = r.t === 2 ? 'r2' : 'r1';
    const key = r.nr === 13 ? 'lula' : 'bolsonaro';
    nominalNotValid += r.nominal - r.valid;
    national[t][key] += r.valid;
    if (r.uf !== 'MG') continue;
    stateMg[t][key] += r.valid;
    const m = municipalities[r.mun];
    if (!m) throw new Error(`candidato 2022: município ${r.mun} sem linha no detalhe`);
    m[t][key] += r.valid;
  }
  const names = [...new Set(cand.data.rows.map((r) => `${r.nr} ${r.name} (${r.party})`))];
  checks.push(
    `candidato 2022: candidaturas lidas ${names.join('; ')}; votos nominais não válidos (13/22): ${nominalNotValid}.`,
  );

  const sources: SourceRecord[] = [det.source, cand.source];
  let locals: Record<string, Local2022> = {};
  if (!SKIP_SECTIONS) {
    const pl = await places2022();
    const sec = await sections();
    sources.push(sec.source, pl.source);
    checks.push(
      `eleitorado_local 2022: ${pl.data.rows} seções MG (turno 1) → ${Object.keys(pl.data.places).length} locais; ${pl.data.conflicting_bairro} seções com NM_BAIRRO diferente da 1ª seção do mesmo local (mantida a 1ª).`,
    );
    checks.push(
      `votacao_secao 2022: ${sec.data.lines} linhas de Presidente no arquivo _BR (todas as UFs); votos em MG por código de Presidente: ${Object.entries(
        sec.data.votavel,
      )
        .sort()
        .map(([k, v]) => `${k}=${v}`)
        .join(', ')}.`,
    );
    // reconciliation: Σ places per municipality vs munzona files
    const perMun = new Map<string, { r1: PresVotes; r2: PresVotes }>();
    let noPlace = 0;
    for (const [k, a] of Object.entries(sec.data.locals)) {
      const [mun, zona, local] = k.split('|');
      const p = pl.data.places[k];
      if (!p) noPlace++;
      locals[k] = {
        cd_municipio: mun!,
        zona: Number(zona),
        local: Number(local),
        name: p?.name ?? '',
        bairro: p?.bairro ?? '',
        lat: p?.lat ?? null,
        lon: p?.lon ?? null,
        r1: a.r1,
        r2: a.r2,
      };
      const s = perMun.get(mun!) ?? { r1: emptyVotes(), r2: emptyVotes() };
      addInto(s.r1, a.r1);
      addInto(s.r2, a.r2);
      perMun.set(mun!, s);
    }
    let exact = 0;
    const diffs: string[] = [];
    for (const [mun, m] of Object.entries(municipalities)) {
      const s = perMun.get(mun);
      const ok =
        s &&
        (['r1', 'r2'] as const).every(
          (t) =>
            s[t].lula === m[t].lula &&
            s[t].bolsonaro === m[t].bolsonaro &&
            s[t].valid === m[t].valid,
        );
      if (ok) exact++;
      else if (diffs.length < 10)
        diffs.push(
          `${mun} ${m.name}: seção r1 ${JSON.stringify(s?.r1)} vs munzona ${JSON.stringify({ lula: m.r1.lula, bolsonaro: m.r1.bolsonaro, valid: m.r1.valid })}`,
        );
    }
    checks.push(
      `reconciliação seção × munzona (Lula, Bolsonaro, válidos; r1 e r2): ${exact} de ${Object.keys(municipalities).length} municípios idênticos; ${Object.keys(locals).length} locais com votos, ${noPlace} sem cadastro no eleitorado_local.${diffs.length ? ' Exemplos de diferença: ' + diffs.join(' | ') : ''}`,
    );
  } else {
    checks.push('--skip-sections: nível de local/bairro 2022 não gerado.');
    locals = {};
  }

  const out: President2022File = {
    schema: 'president-2022/v1',
    generated_at: new Date().toISOString(),
    sources,
    municipalities,
    state_mg: stateMg,
    national,
    by_uf_r1: byUf,
    locals,
    checks,
  };
  writeFileSync(join(dir22, 'president-2022.json'), JSON.stringify(out), 'utf8');
  const n26: National2026File = {
    schema: 'national-2026/v1',
    source: nat26.source,
    by_uf: nat26.data,
  };
  writeFileSync(join(dir26, 'national-2026.json'), JSON.stringify(n26), 'utf8');
  if (client.attempts.length)
    writeFileSync(join(dir22, 'http-attempts.json'), JSON.stringify(client.attempts), 'utf8');

  const pct = (a: number, b: number) => ((a / b) * 100).toFixed(2);
  for (const t of ['r1', 'r2'] as const) {
    const n = national[t];
    const s = stateMg[t];
    log(
      `${t} BR: aptos ${n.eligible} comp ${n.turnout} válidos ${n.valid} Lula ${n.lula} (${pct(n.lula, n.valid)}%) Bolsonaro ${n.bolsonaro} (${pct(n.bolsonaro, n.valid)}%)`,
    );
    log(
      `${t} MG: aptos ${s.eligible} comp ${s.turnout} válidos ${s.valid} Lula ${s.lula} (${pct(s.lula, s.valid)}%) Bolsonaro ${s.bolsonaro} (${pct(s.bolsonaro, s.valid)}%)`,
    );
  }
  log(
    `municípios MG: ${Object.keys(municipalities).length}; locais 2022: ${Object.keys(locals).length}`,
  );
  for (const c of checks) log(`check: ${c.slice(0, 400)}`);
  log(`HTTP requests: ${client.attempts.length}`);
}

main().catch((e) => {
  console.error(`[tse:2022] FAILED: ${(e as Error).message}`);
  if (client.attempts.length)
    writeFileSync(join(dir22, 'http-attempts.json'), JSON.stringify(client.attempts), 'utf8');
  process.exit(1);
});
