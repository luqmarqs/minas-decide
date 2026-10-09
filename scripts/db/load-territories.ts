/**
 * Loads territories from the published static snapshot into the TARGET `public.territories`
 * table (idempotent upsert, batches, service role). The snapshot is the source of truth;
 * the table exists for FKs/validation (D14).
 *
 * Usage:
 *   npx tsx scripts/db/load-territories.ts [path/to/territories-index.json] [--dry-run]
 * Without a path, reads public/data/manifest.json -> public/data/<release_id>/territories-index.json.
 * Never deletes rows.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { TerritoryIndexEntry } from '../../shared/contracts/territory.ts';
import type { Database } from '../../shared/types/database.ts';
import { assertTargetUrl, loadDevVars, requireEnv } from './load-env.ts';

const BATCH = 500;
const TYPE_ORDER = { state: 0, municipality: 1, neighborhood: 2 } as const;

function resolveInput(arg: string | undefined): string {
  if (arg) return resolve(arg);
  const manifestPath = resolve('public/data/manifest.json');
  if (!existsSync(manifestPath)) {
    throw new Error(
      'No path given and public/data/manifest.json not found. Generate the snapshot first (npm run etl:build).',
    );
  }
  const manifest = z
    .object({ release_id: z.string().regex(/^[A-Za-z0-9._-]+$/) })
    .parse(JSON.parse(readFileSync(manifestPath, 'utf8')));
  return resolve('public/data', manifest.release_id, 'territories-index.json');
}

type Row = Database['public']['Tables']['territories']['Insert'];

export function toRow(e: TerritoryIndexEntry): Row {
  return {
    id: e.id,
    type: e.type,
    name: e.name,
    normalized_name: e.normalized_name,
    parent_id: e.parent_id,
    state_code: 'MG',
    ibge_code: e.ibge_code,
    slug: e.slug,
    municipality_name: e.municipality_name,
    centroid_lon: e.centroid ? e.centroid[0] : null,
    centroid_lat: e.centroid ? e.centroid[1] : null,
    data_quality: e.data_quality,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const file = resolveInput(args.find((a) => !a.startsWith('--')));
  if (!existsSync(file)) throw new Error(`File not found: ${file}`);

  const entries = z.array(TerritoryIndexEntry).parse(JSON.parse(readFileSync(file, 'utf8')));
  const rows = entries
    .map(toRow)
    .sort(
      (a, b) =>
        TYPE_ORDER[a.type as keyof typeof TYPE_ORDER] -
        TYPE_ORDER[b.type as keyof typeof TYPE_ORDER],
    );
  const ids = new Set(rows.map((r) => r.id));
  const orphans = rows.filter((r) => r.parent_id && !ids.has(r.parent_id));
  console.log(
    `load-territories: ${rows.length} entries (${orphans.length} with parent outside the file)`,
  );
  if (dryRun) {
    console.log('load-territories: --dry-run, nothing written.');
    return;
  }

  loadDevVars();
  const url = requireEnv('SUPABASE_TARGET_URL');
  assertTargetUrl(url);
  const db = createClient<Database>(url, requireEnv('SUPABASE_TARGET_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let done = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { error } = await db.from('territories').upsert(batch, { onConflict: 'id' });
    if (error)
      throw new Error(`upsert failed at batch ${i / BATCH} (code ${error.code ?? 'unknown'})`);
    done += batch.length;
    console.log(`load-territories: upserted ${done}/${rows.length}`);
  }
}

main().catch((e: unknown) => {
  console.error(`load-territories: ${e instanceof Error ? e.message : 'failed'}`);
  process.exit(1);
});
