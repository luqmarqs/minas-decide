/**
 * Validate a published snapshot in public/data: manifest schema, file hashes,
 * contract conformance of every file, numeric ranges, and absence of PII/SOURCE
 * identifiers. Exit 1 on any blocking error.
 * Usage: npm run data:validate [-- --base public/data] [--manifest <path/to/release-manifest.json>]
 * (--manifest validates a non-current release that coexists under --base).
 *
 * Cross-checks (R2): Σ municipalities = state and Σ neighborhoods = municipality (tolerance 0),
 * share_of_valid in [0,1] and consistent with votes/valid, delta_pp/delta_votes consistent with
 * the stored votes, and no orphan territory ids between index, metrics files, parents and layers.
 *
 * Rodada 3: president_comparison (shares in [0,1] and = votes/valid, delta_pp_r1/delta_votes_r1 coherent,
 * precision by territory level, 2026 values = president results, Σ municipalities 2022 = state 2022),
 * president_comparison layers (= municipality delta, symmetric domain), highlights.json (schema + non-empty
 * source) and public/data/pois/terminais-mg.json (PoiFile schema, coordinates inside the MG bounding box).
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { MapLayerValues, SnapshotManifest } from '../../shared/contracts/metrics.ts';
import type { TerritoryMetrics } from '../../shared/contracts/metrics.ts';
import { TerritoryIndexEntry } from '../../shared/contracts/territory.ts';
import {
  CandidateIndex,
  Highlights,
  Methodology,
  MunicipalityMetricsFile,
  PoiFile,
} from '../../shared/contracts/snapshot.ts';
import { z } from 'zod';

const argv = process.argv.slice(2);
const argValue = (k: string): string | undefined => {
  const i = argv.indexOf(k);
  const v = i >= 0 ? argv[i + 1] : undefined;
  return v && !v.startsWith('--') ? v : undefined;
};
const base = resolve(argValue('--base') ?? join('public', 'data'));
const errors: string[] = [];
const warn: string[] = [];

const manifestArg = argValue('--manifest');
const manifestPath = manifestArg ? resolve(manifestArg) : join(base, 'manifest.json');
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
const PRES_NUMBER = { lula: 13, bolsonaro: 22 } as const;
let presChecked = 0;
const presPrecision: Record<string, number> = {};
let poiChecked = 0;
let crossChecked = 0;
let territoriesSeen = 0;
let indexEntries: z.infer<typeof TerritoryIndexEntry>[] = [];
const metricsFiles = new Map<string, z.infer<typeof MunicipalityMetricsFile>>();
const layerFiles: { rel: string; layer: z.infer<typeof MapLayerValues> }[] = [];

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
  else if (rel === 'highlights.json') schema = Highlights;
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
  if (rel === 'highlights.json') checkHighlights(r.data as z.infer<typeof Highlights>);
  if (rel === 'territories-index.json') indexEntries = r.data as typeof indexEntries;
  if (rel.startsWith('layers/'))
    layerFiles.push({ rel, layer: r.data as z.infer<typeof MapLayerValues> });
  if (rel.startsWith('metrics/')) {
    const file = r.data as z.infer<typeof MunicipalityMetricsFile>;
    metricsFiles.set(file.territory_id, file);
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
      if (c.share_of_valid < 0 || c.share_of_valid > 1)
        errors.push(`${rel} ${tm.territory_id}: share_of_valid out of [0,1] (${c.candidate_id})`);
      const expectedShare = valid > 0 ? Math.min(1, c.votes / valid) : 0;
      if (Math.abs(c.share_of_valid - expectedShare) > 1e-9)
        errors.push(
          `${rel} ${tm.territory_id}: share_of_valid ${c.share_of_valid} != votes/valid ${expectedShare} (${office} ${c.candidate_id})`,
        );
      if (valid > 0 && c.votes > valid)
        warn.push(
          `${rel} ${tm.territory_id}: candidate votes exceed valid (${office}) — sub judice in source`,
        );
    }
  }
  for (const c of tm.comparison_2022) {
    const bothVotes = c.votes_2022 !== null && c.votes_2026 !== null;
    if (c.delta_votes !== null) {
      if (!bothVotes || c.delta_votes !== c.votes_2026! - c.votes_2022!)
        errors.push(`${rel} ${tm.territory_id}: delta_votes inconsistent (${c.candidate_id})`);
    } else if (bothVotes)
      errors.push(
        `${rel} ${tm.territory_id}: delta_votes null with both vote counts (${c.candidate_id})`,
      );
    const shares =
      c.votes_2022 !== null &&
      c.valid_2022 !== null &&
      c.valid_2022 > 0 &&
      c.votes_2026 !== null &&
      c.valid_2026 !== null &&
      c.valid_2026 > 0;
    if (shares) {
      const exp = (c.votes_2026! / c.valid_2026! - c.votes_2022! / c.valid_2022!) * 100;
      // stored value is rounded to 0.01 pp
      if (c.delta_pp === null || Math.abs(c.delta_pp - exp) > 0.0051)
        errors.push(
          `${rel} ${tm.territory_id}: delta_pp ${c.delta_pp} != ${exp.toFixed(4)} (${c.candidate_id})`,
        );
    } else if (c.delta_pp !== null)
      errors.push(
        `${rel} ${tm.territory_id}: delta_pp set without both shares (${c.candidate_id})`,
      );
  }
  checkPresident(tm, rel);
  if (tm.status === 'validated' && m.status !== 'validated')
    errors.push(
      `${rel} ${tm.territory_id}: territory status validated but manifest is ${m.status}`,
    );
}

/* ---------- rodada 3: presidential comparison, highlights, POIs ---------- */

function checkPresident(tm: TerritoryMetrics, rel: string) {
  const pc = tm.president_comparison;
  if (!pc) return;
  presChecked++;
  const id = tm.territory_id;
  presPrecision[pc.precision] = (presPrecision[pc.precision] ?? 0) + 1;
  const level = id === 'mg' ? 'state' : /^mg-\d{7}$/.test(id) ? 'municipality' : 'neighborhood';
  if (level !== 'neighborhood' && pc.precision === 'approximate')
    errors.push(`${rel} ${id}: president_comparison precision approximate at ${level} level`);
  if (level === 'neighborhood' && pc.precision === 'exact')
    errors.push(`${rel} ${id}: president_comparison precision exact at neighborhood level`);
  const keys = pc.entries
    .map((e) => e.key)
    .sort()
    .join(',');
  if (keys !== 'bolsonaro,lula') errors.push(`${rel} ${id}: president_comparison keys ${keys}`);
  const validPres = tm.valid_by_office.president ?? null;
  for (const e of pc.entries) {
    const tag = `${rel} ${id} president_comparison.${e.key}`;
    for (const [v, val, sh, label] of [
      [e.votes_2022_r1, e.valid_2022_r1, e.share_2022_r1, '2022_r1'],
      [e.votes_2022_r2, e.valid_2022_r2, e.share_2022_r2, '2022_r2'],
      [e.votes_2026_r1, e.valid_2026_r1, e.share_2026_r1, '2026_r1'],
    ] as const) {
      if (sh !== null && (sh < 0 || sh > 1)) errors.push(`${tag}: share_${label} out of [0,1]`);
      if (v !== null && val !== null && val > 0) {
        if (sh === null || Math.abs(sh - Math.min(1, v / val)) > 1e-9)
          errors.push(`${tag}: share_${label} != votes/valid`);
        if (v > val) errors.push(`${tag}: votes_${label} > valid_${label}`);
      } else if (sh !== null) errors.push(`${tag}: share_${label} set without votes/valid`);
    }
    if (e.share_2022_r1 !== null && e.share_2026_r1 !== null) {
      const exp = (e.share_2026_r1 - e.share_2022_r1) * 100;
      if (e.delta_pp_r1 === null || Math.abs(e.delta_pp_r1 - exp) > 0.0051)
        errors.push(`${tag}: delta_pp_r1 ${e.delta_pp_r1} != ${exp.toFixed(4)}`);
    } else if (e.delta_pp_r1 !== null) errors.push(`${tag}: delta_pp_r1 set without both shares`);
    if (e.votes_2022_r1 !== null && e.votes_2026_r1 !== null) {
      if (e.delta_votes_r1 !== e.votes_2026_r1 - e.votes_2022_r1)
        errors.push(`${tag}: delta_votes_r1 inconsistent`);
    } else if (e.delta_votes_r1 !== null) errors.push(`${tag}: delta_votes_r1 set without votes`);
    if (pc.precision === 'unavailable' && (e.votes_2022_r1 !== null || e.votes_2022_r2 !== null))
      errors.push(`${tag}: 2022 values present with precision unavailable`);
    if (pc.precision !== 'unavailable' && e.votes_2022_r1 === null)
      errors.push(`${tag}: precision ${pc.precision} without 2022 values`);
    // 2026 side must be the president result already in the file
    if (e.number_2026 !== PRES_NUMBER[e.key]) errors.push(`${tag}: number_2026 ${e.number_2026}`);
    const r = (tm.results.president ?? []).find((c) => c.number === e.number_2026);
    if (e.valid_2026_r1 !== validPres)
      errors.push(
        `${tag}: valid_2026_r1 ${e.valid_2026_r1} != valid_by_office.president ${validPres}`,
      );
    if (validPres !== null && e.votes_2026_r1 !== (r?.votes ?? 0))
      errors.push(`${tag}: votes_2026_r1 ${e.votes_2026_r1} != results.president ${r?.votes ?? 0}`);
  }
}

function checkHighlights(h: z.infer<typeof Highlights>) {
  const ids = new Set<string>();
  for (const i of h.items) {
    if (ids.has(i.id)) errors.push(`highlights: duplicated id ${i.id}`);
    ids.add(i.id);
    if (!i.source.trim()) errors.push(`highlights: item ${i.id} without source`);
    if (!Number.isFinite(i.value)) errors.push(`highlights: item ${i.id} value not finite`);
    if (i.unit === 'percent' && (i.value < -100 || i.value > 100))
      errors.push(`highlights: item ${i.id} percent out of range`);
  }
  for (const w of h.why_minas)
    if (!w.source.trim()) errors.push(`highlights: "${w.title}" without source`);
  if (h.items.length === 0) errors.push('highlights: no items');
}

/** Minas Gerais bounding box (IBGE state limits ≈ lon −51.05..−39.86, lat −22.93..−14.23) + ~2 km margin. */
const MG_BBOX = { minLon: -51.07, maxLon: -39.84, minLat: -22.95, maxLat: -14.21 };
function checkPois() {
  const p = join(base, 'pois', 'terminais-mg.json');
  if (!existsSync(p)) {
    warn.push('pois/terminais-mg.json not found (POI layer not published)');
    return;
  }
  const text = readFileSync(p, 'utf8');
  if (forbidden.test(text)) errors.push('pois/terminais-mg.json: forbidden identifier/PII pattern');
  const r = PoiFile.safeParse(JSON.parse(text));
  if (!r.success) {
    errors.push(
      `pois/terminais-mg.json: ${r.error.issues[0]?.path.join('.')} ${r.error.issues[0]?.message}`,
    );
    return;
  }
  if (!r.data.attribution.includes('OpenStreetMap'))
    errors.push('pois: attribution must credit OpenStreetMap');
  if (!/ODbL/.test(r.data.license)) errors.push('pois: license must be ODbL');
  const ids = new Set<string>();
  for (const i of r.data.items) {
    poiChecked++;
    if (ids.has(i.id)) errors.push(`pois: duplicated id ${i.id}`);
    ids.add(i.id);
    const [lon, lat] = i.coordinates;
    if (
      lon < MG_BBOX.minLon ||
      lon > MG_BBOX.maxLon ||
      lat < MG_BBOX.minLat ||
      lat > MG_BBOX.maxLat
    )
      errors.push(`pois: ${i.id} outside MG bbox (${lon}, ${lat})`);
    if (!i.name.trim()) errors.push(`pois: ${i.id} without name`);
    if (!/^https:\/\/www\.openstreetmap\.org\/(node|way|relation)\/\d+$/.test(i.osm_url))
      errors.push(`pois: ${i.id} unexpected osm_url`);
    if (
      i.municipality_id !== null &&
      indexEntries.length &&
      !indexEntries.some((e) => e.id === i.municipality_id)
    )
      errors.push(`pois: ${i.id} municipality ${i.municipality_id} not in index`);
  }
}

/* ---------- cross-file checks ---------- */
type Sums = Record<string, number>;
const MAJORITARIAN = ['president', 'governor', 'senator'] as const;

/**
 * Flattens the additive quantities of one TerritoryMetrics. Per-office eligible/turnout are not in the
 * contract (turnout is president-based), so valid_by_office and the (complete) majoritarian candidate
 * lists cover the other offices. Proportional lists are truncated to top-N and cannot be summed.
 */
function additive(tm: TerritoryMetrics): Sums {
  const o: Sums = {};
  const t = tm.turnout;
  if (t) {
    o['president.eligible'] = t.eligible;
    o['president.turnout'] = t.turnout;
    o['president.abstention'] = t.abstention;
    o['president.valid'] = t.valid;
    o['president.blank'] = t.blank;
    o['president.null_votes'] = t.null_votes;
  }
  for (const [office, v] of Object.entries(tm.valid_by_office)) o[`${office}.valid_by_office`] = v;
  for (const office of MAJORITARIAN)
    for (const c of tm.results[office] ?? []) o[`${office}.votes.${c.candidate_id}`] = c.votes;
  return o;
}

function compareSums(label: string, parent: TerritoryMetrics, children: TerritoryMetrics[]) {
  const sum: Sums = {};
  for (const c of children)
    for (const [k, v] of Object.entries(additive(c))) sum[k] = (sum[k] ?? 0) + v;
  const expected = additive(parent);
  let bad = 0;
  for (const k of new Set([...Object.keys(sum), ...Object.keys(expected)])) {
    if ((sum[k] ?? 0) !== (expected[k] ?? 0)) {
      bad++;
      if (bad <= 3)
        errors.push(`${label}: ${k} children sum ${sum[k] ?? 0} != parent ${expected[k] ?? 0}`);
    }
  }
  if (bad > 3) errors.push(`${label}: ... and ${bad - 3} more mismatching quantities`);
  crossChecked++;
}

function crossChecks() {
  if (indexEntries.length === 0) return;
  const byId = new Map(indexEntries.map((e) => [e.id, e]));
  if (byId.size !== indexEntries.length) errors.push('territories-index: duplicated ids');
  // Σ municipalities = state
  const munMetrics: TerritoryMetrics[] = [];
  for (const e of indexEntries) {
    if (e.type !== 'municipality') continue;
    const mf = metricsFiles.get(e.id);
    if (!mf) errors.push(`orphan: municipality ${e.id} in index has no metrics file`);
    else munMetrics.push(...mf.self);
  }
  const state = metricsFiles.get('mg')?.self[0];
  if (state) compareSums('state = Σ municipalities', state, munMetrics);
  else errors.push('metrics/mg.json missing for state sum check');
  // Σ neighborhoods = municipality; parents; orphans
  for (const [id, mf] of metricsFiles) {
    if (id !== 'mg' && !byId.has(id)) errors.push(`orphan: metrics file ${id} not in index`);
    for (const tm of mf.self)
      if (tm.territory_id !== id) errors.push(`${id}: self territory_id mismatch`);
    const kids = Object.entries(mf.children);
    for (const [cid, list] of kids) {
      const entry = byId.get(cid);
      if (!entry) errors.push(`orphan: ${cid} (child of ${id}) not in index`);
      else if (entry.parent_id !== id)
        errors.push(`${cid}: index parent ${entry.parent_id} != file ${id}`);
      for (const tm of list)
        if (tm.territory_id !== cid)
          errors.push(`${id}: child key ${cid} != territory_id ${tm.territory_id}`);
    }
    const self = mf.self[0];
    if (kids.length > 0 && self)
      compareSums(
        `${id} = Σ neighborhoods`,
        self,
        kids.flatMap(([, l]) => (l[0] ? [l[0]] : [])),
      );
  }
  for (const e of indexEntries) {
    if (e.parent_id !== null && !byId.has(e.parent_id))
      errors.push(`orphan: ${e.id} has parent ${e.parent_id} not in index`);
    if (e.type === 'neighborhood') {
      const parent = e.parent_id ? metricsFiles.get(e.parent_id) : undefined;
      if (!parent?.children[e.id])
        errors.push(`orphan: neighborhood ${e.id} has no metrics in ${e.parent_id}`);
    }
  }
  for (const { rel, layer } of layerFiles)
    for (const tid of Object.keys(layer.values))
      if (!byId.has(tid)) errors.push(`orphan: layer ${rel} references ${tid} not in index`);

  // presidential comparison: Σ municipalities (exact) = state for the 2022 figures
  if (state?.president_comparison) {
    for (const key of ['lula', 'bolsonaro'] as const) {
      const sums = { v1: 0, val1: 0, v2: 0, val2: 0 };
      for (const mm of munMetrics) {
        const e = mm.president_comparison?.entries.find((x) => x.key === key);
        sums.v1 += e?.votes_2022_r1 ?? 0;
        sums.val1 += e?.valid_2022_r1 ?? 0;
        sums.v2 += e?.votes_2022_r2 ?? 0;
        sums.val2 += e?.valid_2022_r2 ?? 0;
      }
      const se = state.president_comparison.entries.find((x) => x.key === key);
      const exp = {
        v1: se?.votes_2022_r1,
        val1: se?.valid_2022_r1,
        v2: se?.votes_2022_r2,
        val2: se?.valid_2022_r2,
      };
      for (const k of Object.keys(sums) as (keyof typeof sums)[])
        if (sums[k] !== exp[k])
          errors.push(
            `state = Σ municipalities (president 2022 ${key} ${k}): ${sums[k]} != ${exp[k]}`,
          );
    }
    crossChecked++;
  }
  // president_comparison layers = municipality delta_pp_r1, symmetric domain
  for (const { rel, layer } of layerFiles) {
    if (layer.layer !== 'president_comparison') continue;
    if (layer.unit !== 'pp') errors.push(`${rel}: unit must be pp`);
    if (layer.candidate_id !== 'lula' && layer.candidate_id !== 'bolsonaro')
      errors.push(`${rel}: candidate_id must be lula|bolsonaro`);
    if (layer.domain[0] !== -layer.domain[1]) errors.push(`${rel}: domain not symmetric`);
    for (const [tid, v] of Object.entries(layer.values)) {
      const e = metricsFiles
        .get(tid)
        ?.self[0]?.president_comparison?.entries.find((x) => x.key === layer.candidate_id);
      if (!e || e.delta_pp_r1 === null || Math.abs(e.delta_pp_r1 - v) > 1e-4)
        errors.push(`${rel}: ${tid} value ${v} != delta_pp_r1 ${e?.delta_pp_r1}`);
      if (Math.abs(v) > layer.domain[1] + 1e-9) errors.push(`${rel}: ${tid} outside domain`);
    }
  }
}

crossChecks();
checkPois();

console.log(
  `validate: release=${m.release_id} status=${m.status} files=${m.files.length} checked=${checked} territories=${territoriesSeen} crosschecks=${crossChecked} warnings=${warn.length} errors=${errors.length}`,
);
console.log(
  `validate: president_comparison=${presChecked} ${JSON.stringify(presPrecision)} pois=${poiChecked}`,
);
for (const w of warn.slice(0, 10)) console.log('  warn:', w);
for (const e of errors.slice(0, 20)) console.error('  error:', e);
if (errors.length) process.exit(1);
