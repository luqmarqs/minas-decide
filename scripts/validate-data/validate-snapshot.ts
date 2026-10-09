/**
 * Validate a published snapshot in public/data: manifest schema, file hashes,
 * contract conformance of every file, numeric ranges, and absence of PII/SOURCE
 * identifiers. Exit 1 on any blocking error. Usage: npm run data:validate [-- --base public/data]
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { MapLayerValues, SnapshotManifest } from '../../shared/contracts/metrics.ts';
import type { TerritoryMetrics } from '../../shared/contracts/metrics.ts';
import { TerritoryIndexEntry } from '../../shared/contracts/territory.ts';
import {
  CandidateIndex,
  Methodology,
  MunicipalityMetricsFile,
} from '../../shared/contracts/snapshot.ts';
import { z } from 'zod';

const argv = process.argv.slice(2);
const base = resolve(
  argv[argv.indexOf('--base') + 1] && argv.includes('--base')
    ? argv[argv.indexOf('--base') + 1]!
    : join('public', 'data'),
);
const errors: string[] = [];
const warn: string[] = [];

const manifestPath = join(base, 'manifest.json');
if (!existsSync(manifestPath)) {
  console.error(
    `validate: no manifest at ${manifestPath} (nothing published; frontend will use DEMO fixtures)`,
  );
  process.exit(0);
}
const manifestRaw = readFileSync(manifestPath, 'utf8');
const manifest = SnapshotManifest.safeParse(JSON.parse(manifestRaw));
if (!manifest.success) {
  console.error('manifest.json invalid:', manifest.error.issues.slice(0, 5));
  process.exit(1);
}
const m = manifest.data;
const forbidden =
  /dashboard-eleicoes|[a-z]{20}\.supabase\.co|postgres(ql)?:\/\/|@[a-z0-9.-]+\.[a-z]{2,}|\+55\d{10,11}|\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/i;
if (forbidden.test(manifestRaw))
  errors.push('manifest contains a forbidden identifier/PII pattern');

let checked = 0;
let territoriesSeen = 0;
for (const f of m.files) {
  const p = join(base, f.path);
  if (!existsSync(p)) {
    errors.push(`missing file ${f.path}`);
    continue;
  }
  const text = readFileSync(p, 'utf8');
  const sha = createHash('sha256').update(text).digest('hex');
  if (sha !== f.sha256) errors.push(`hash mismatch ${f.path}`);
  if (Buffer.byteLength(text) !== f.bytes) errors.push(`byte size mismatch ${f.path}`);
  if (forbidden.test(text)) errors.push(`forbidden identifier/PII pattern in ${f.path}`);
  const json: unknown = JSON.parse(text);
  const rel = f.path.slice(m.release_id.length + 1);
  let schema: z.ZodTypeAny | null = null;
  if (rel === 'territories-index.json') schema = z.array(TerritoryIndexEntry);
  else if (rel === 'candidates.json') schema = CandidateIndex;
  else if (rel === 'methodology.json') schema = Methodology;
  else if (rel.startsWith('metrics/')) schema = MunicipalityMetricsFile;
  else if (rel.startsWith('layers/')) schema = MapLayerValues;
  if (!schema) {
    warn.push(`unknown file kind ${rel}`);
    continue;
  }
  const r = schema.safeParse(json);
  if (!r.success) {
    errors.push(`${rel}: ${r.error.issues[0]?.path.join('.')} ${r.error.issues[0]?.message}`);
    continue;
  }
  checked++;
  if (rel.startsWith('metrics/')) {
    const file = r.data as z.infer<typeof MunicipalityMetricsFile>;
    for (const tm of [...file.self, ...Object.values(file.children).flat()]) {
      territoriesSeen++;
      checkMetrics(tm, rel);
    }
  }
}

function checkMetrics(tm: TerritoryMetrics, rel: string) {
  const t = tm.turnout;
  if (t) {
    if (t.turnout > t.eligible) errors.push(`${rel} ${tm.territory_id}: turnout > eligible`);
    if (Math.abs(t.eligible - t.turnout - t.abstention) > 0)
      errors.push(`${rel} ${tm.territory_id}: abstention != eligible - turnout`);
    if (t.abstention_rate < 0 || t.abstention_rate > 1)
      errors.push(`${rel} ${tm.territory_id}: abstention_rate out of range`);
  }
  for (const [office, list] of Object.entries(tm.results)) {
    const valid = tm.valid_by_office[office as keyof typeof tm.valid_by_office] ?? 0;
    for (const c of list ?? []) {
      if (c.votes < 0) errors.push(`${rel} ${tm.territory_id}: negative votes`);
      if (valid > 0 && c.votes > valid)
        warn.push(
          `${rel} ${tm.territory_id}: candidate votes exceed valid (${office}) — sub judice in source`,
        );
    }
  }
  if (tm.status === 'validated' && m.status !== 'validated')
    errors.push(
      `${rel} ${tm.territory_id}: territory status validated but manifest is ${m.status}`,
    );
}

console.log(
  `validate: release=${m.release_id} status=${m.status} files=${m.files.length} checked=${checked} territories=${territoriesSeen} warnings=${warn.length} errors=${errors.length}`,
);
for (const w of warn.slice(0, 10)) console.log('  warn:', w);
for (const e of errors.slice(0, 20)) console.error('  error:', e);
if (errors.length) process.exit(1);
