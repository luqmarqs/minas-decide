/**
 * Offline, read-only extractor: SOURCE (legacy electoral Supabase) → data/private/extract/<release>/
 *
 *   npm run etl:export -- --dry-run
 *   npm run etl:export -- --municipality 3140001            # one municipality (spike)
 *   npm run etl:export -- --all-mg                          # whole state in batches
 *   flags: --years 2022,2026  --output <dir>  --max-rows N  --batch-size 40  --pause-ms 400  --release <id>
 *
 * Never writes to SOURCE. Stops with an explicit error on timeout, schema mismatch,
 * row-limit overflow or unexpected connection. Output is gitignored and must never
 * be published as-is (it is polling-place level, not the public aggregate).
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { assertNotTarget, resolveSource, runQuery } from './source.ts';
import {
  ELECTORAL_TABLES,
  MAJORITARIAN_CARGOS,
  PROPORTIONAL_CARGOS,
  q,
  scopeWhere,
} from './sql.ts';

interface Args {
  dryRun: boolean;
  municipality?: string;
  allMg: boolean;
  years: number[];
  output: string;
  maxRows: number;
  batchSize: number;
  pauseMs: number;
  release: string;
}

function parseArgs(argv: string[]): Args {
  const get = (k: string) => {
    const i = argv.indexOf(k);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const municipality = get('--municipality');
  if (municipality && !/^\d{7}$/.test(municipality))
    throw new Error('--municipality expects a 7-digit IBGE code');
  return {
    dryRun: argv.includes('--dry-run'),
    municipality,
    allMg: argv.includes('--all-mg'),
    years: (get('--years') ?? '2022,2026').split(',').map(Number),
    output: get('--output') ?? '',
    maxRows: Number(get('--max-rows') ?? 5_000_000),
    batchSize: Number(get('--batch-size') ?? 40),
    pauseMs: Number(get('--pause-ms') ?? 400),
    release: get('--release') ?? (municipality ? `mg-${municipality}-${today}` : `mg-${today}`),
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

interface ManifestEntry {
  file: string;
  rows: number;
  bytes: number;
  ms: number;
  sha256: string;
  sql: string;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.municipality && !args.allMg && !args.dryRun) {
    throw new Error('Specify --municipality <ibge7> or --all-mg (or --dry-run).');
  }
  const conn = resolveSource();
  assertNotTarget(conn);
  const scope = { uf: 'MG', ibge: args.municipality };
  const where = scopeWhere(scope);
  const outDir = resolve(args.output || join('data', 'private', 'extract', args.release));

  console.log(
    `[etl] source=${conn.alias} mode=${conn.mode} scope=${args.municipality ? `municipality ${args.municipality}` : 'all MG'} release=${args.release}`,
  );
  console.log(`[etl] output=${outDir} dryRun=${args.dryRun}`);

  // 1) probe: read-only, correct schema
  const probe = runQuery<{
    db: string;
    read_only: string;
    statement_timeout: string;
    electoral_tables: number;
  }>(conn, q.probe(), { statementTimeout: '5s' });
  const p = probe.rows[0];
  if (!p || p.read_only !== 'on') throw new Error('SOURCE session is not read-only; aborting.');
  if (Number(p.electoral_tables) !== ELECTORAL_TABLES.length) {
    throw new Error(
      `SOURCE schema mismatch: expected ${ELECTORAL_TABLES.length} electoral tables, found ${p.electoral_tables}.`,
    );
  }
  const healthBefore = runQuery(conn, q.health(), { statementTimeout: '5s' }).rows[0];
  console.log(
    `[etl] probe ok (read_only=on, tables=${p.electoral_tables}) health=${JSON.stringify(healthBefore)}`,
  );

  if (args.dryRun) {
    console.log('[etl] dry-run: would run queries:');
    console.log(
      '  - municipalities, locais, totais×5 cargos, candidaturas, votes batches per cargo, historico',
    );
    console.log(`  - where: ${where}`);
    return;
  }

  mkdirSync(outDir, { recursive: true });
  const manifest: ManifestEntry[] = [];
  let totalRows = 0;
  const save = (name: string, rows: unknown[], ms: number, sql: string) => {
    const text = JSON.stringify(rows);
    totalRows += rows.length;
    if (totalRows > args.maxRows)
      throw new Error(`--max-rows exceeded (${totalRows} > ${args.maxRows}); stopping.`);
    writeFileSync(join(outDir, name), text, 'utf8');
    manifest.push({
      file: name,
      rows: rows.length,
      bytes: Buffer.byteLength(text),
      ms,
      sha256: sha256(text),
      sql,
    });
    console.log(`[etl] ${name}: ${rows.length} rows, ${ms} ms`);
  };

  // 2) static dimensions
  let r = runQuery(
    conn,
    args.municipality ? q.municipalityByIbge(args.municipality) : q.municipalities('MG'),
  );
  save('municipios.json', r.rows, r.ms, 'municipalities');
  if (r.rows.length === 0) throw new Error('No municipality matched the scope.');
  await sleep(args.pauseMs);

  r = runQuery(conn, q.locais(where));
  save('locais.json', r.rows, r.ms, 'locais');
  await sleep(args.pauseMs);

  for (const cargo of [...MAJORITARIAN_CARGOS, ...PROPORTIONAL_CARGOS]) {
    r = runQuery(conn, q.totais(where, cargo));
    save(`totais-cargo-${cargo}.json`, r.rows, r.ms, `totais cargo ${cargo}`);
    await sleep(args.pauseMs);
  }

  r = runQuery(conn, q.candidaturas('MG'));
  save('candidaturas.json', r.rows, r.ms, 'candidaturas MG');
  await sleep(args.pauseMs);

  // 3) votes per polling place, keyset-batched by candidate id per office
  for (const cargo of [...MAJORITARIAN_CARGOS, ...PROPORTIONAL_CARGOS]) {
    const ids = runQuery<{ id: number }>(conn, q.candidateIds('MG', cargo)).rows.map((x) =>
      Number(x.id),
    );
    const batchSize = MAJORITARIAN_CARGOS.includes(cargo) ? ids.length || 1 : args.batchSize;
    for (let i = 0, b = 0; i < ids.length; i += batchSize, b++) {
      const batch = ids.slice(i, i + batchSize);
      const res = runQuery(conn, q.votes(batch, where), { statementTimeout: '60s' });
      save(
        `votes-cargo-${cargo}-batch-${String(b).padStart(3, '0')}.json`,
        res.rows,
        res.ms,
        `votes cargo ${cargo} ids[${batch[0]}..${batch[batch.length - 1]}]`,
      );
      await sleep(args.pauseMs);
    }
  }

  // 4) 2022 history (tracked candidates only exist in SOURCE)
  if (args.years.includes(2022)) {
    r = runQuery(conn, q.historico(where));
    save('historico-2022.json', r.rows, r.ms, 'historico 2022 municipio+bairro');
  }

  const healthAfter = runQuery(conn, q.health(), { statementTimeout: '5s' }).rows[0];
  const extractManifest = {
    schema_version: 1,
    release_id: args.release,
    generated_at: new Date().toISOString(),
    source_project_alias: conn.alias,
    source_mode: conn.mode,
    scope: args.municipality ? { uf: 'MG', ibge: args.municipality } : { uf: 'MG' },
    years_requested: args.years,
    tables: ELECTORAL_TABLES,
    health_before: healthBefore,
    health_after: healthAfter,
    total_rows: totalRows,
    total_ms: manifest.reduce((a, m) => a + m.ms, 0),
    files: manifest,
  };
  writeFileSync(
    join(outDir, 'extract-manifest.json'),
    JSON.stringify(extractManifest, null, 2),
    'utf8',
  );
  console.log(
    `[etl] done: ${manifest.length} files, ${totalRows} rows, ${extractManifest.total_ms} ms of queries → ${outDir}`,
  );
  if (!existsSync(join(outDir, 'extract-manifest.json'))) throw new Error('manifest not written');
}

main().catch((err) => {
  console.error(`[etl] FAILED: ${(err as Error).message}`);
  process.exit(1);
});
