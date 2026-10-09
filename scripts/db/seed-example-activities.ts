/**
 * Publishes 3 EXAMPLE activities on the TARGET dev project (owner authorization, rodada 3):
 * leafleting at Belo Horizonte's bus station, Terminal Eldorado (Contagem) and Juiz de Fora's
 * bus station. Titles start with "[EXEMPLO]" so they are never mistaken for real events.
 *
 *   APP_ENV=local npx tsx scripts/db/seed-example-activities.ts            # create/refresh
 *   APP_ENV=local npx tsx scripts/db/seed-example-activities.ts --dry-run  # only prints
 *
 * - Dev only: refuses without APP_ENV=local and unless SUPABASE_TARGET_URL is the TARGET.
 * - Idempotent by title: an existing "[EXEMPLO] …" row is updated (dates, place, status),
 *   never duplicated.
 * - Creator = the first ADMIN_EMAILS admin found in Clerk (ADR 0005); status `published`,
 *   reviewed by the same admin; `public_contact_opt_in = false` (no contact is published).
 * - Dates: 7, 10 and 14 days from today, 09:00 America/Sao_Paulo (UTC−3, no DST).
 * - Coordinates confirmed on 2026-10-09 through Nominatim (OSM) lookups:
 *     W29193604  Terminal Rodoviário Governador Israel Pinheiro (BH)   -19.9139405, -43.9419157
 *     search     Terminal de Ônibus da Estação Eldorado (Contagem)      -19.9385575, -44.0291409
 *     W340964351 Rodoviária de Juiz de Fora – Miguel Mansur             -21.7388159, -43.3749272
 * Secrets come only from `.dev.vars`; nothing secret or personal is printed.
 */
import { createClient } from '@supabase/supabase-js';
import { sanitizePlainText } from '../../shared/schemas/sanitize.ts';
import type { Env } from '../../worker/env.ts';
import { ClerkAuthGateway } from '../../worker/repositories/clerk.ts';
import { assertTargetUrl, loadDevVars, requireEnv } from './load-env.ts';

const dryRun = process.argv.includes('--dry-run');

interface Example {
  title: string;
  territory_id: string;
  public_address: string;
  lat: number;
  lon: number;
  daysAhead: number;
  description: string;
}

const EXAMPLES: Example[] = [
  {
    title: '[EXEMPLO] Panfletagem na Rodoviária de Belo Horizonte',
    territory_id: 'mg-3106200',
    public_address:
      'Terminal Rodoviário Governador Israel Pinheiro (Rodoviária), Praça Rio Branco — Centro, Belo Horizonte/MG',
    lat: -19.9139405,
    lon: -43.9419157,
    daysAhead: 7,
    description:
      'ATIVIDADE DE EXEMPLO publicada para demonstrar a agenda da campanha. Panfletagem da campanha de Lula na entrada principal da Rodoviária de Belo Horizonte. Leve água e chegue 15 minutos antes.',
  },
  {
    title: '[EXEMPLO] Panfletagem no Terminal Eldorado (Contagem)',
    territory_id: 'mg-3118601',
    public_address: 'Terminal de ônibus da Estação Eldorado — Eldorado, Contagem/MG',
    lat: -19.9385575,
    lon: -44.0291409,
    daysAhead: 10,
    description:
      'ATIVIDADE DE EXEMPLO publicada para demonstrar a agenda da campanha. Panfletagem da campanha de Lula no Terminal Eldorado, no horário de maior movimento da manhã.',
  },
  {
    title: '[EXEMPLO] Panfletagem na Rodoviária de Juiz de Fora',
    territory_id: 'mg-3136702',
    public_address: 'Rodoviária de Juiz de Fora – Miguel Mansur — São Dimas, Juiz de Fora/MG',
    lat: -21.7388159,
    lon: -43.3749272,
    daysAhead: 14,
    description:
      'ATIVIDADE DE EXEMPLO publicada para demonstrar a agenda da campanha. Panfletagem da campanha de Lula na Rodoviária de Juiz de Fora, no saguão de embarque.',
  },
];

/** YYYY-MM-DD of "today + n days" in São Paulo, then 09:00 local = 12:00 UTC (UTC−3). */
export function nineAmSaoPaulo(
  daysAhead: number,
  now = new Date(),
): { starts: string; ends: string } {
  const local = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const [y, m, d] = local.split('-').map(Number) as [number, number, number];
  const starts = new Date(Date.UTC(y, m - 1, d + daysAhead, 12, 0, 0));
  const ends = new Date(starts.getTime() + 2 * 60 * 60 * 1000);
  return { starts: starts.toISOString(), ends: ends.toISOString() };
}

async function main(): Promise<void> {
  if (process.env.APP_ENV !== 'local') {
    throw new Error('Refusing: export APP_ENV=local to seed example activities (dev only).');
  }
  loadDevVars();
  const url = requireEnv('SUPABASE_TARGET_URL');
  assertTargetUrl(url);
  const db = createClient(url, requireEnv('SUPABASE_TARGET_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ADR 0005: creator/reviewer = the Clerk id of the first ADMIN_EMAILS entry that exists in
  // Clerk AND is listed in app_private.admins (run scripts/db/bootstrap-admin.ts first).
  const gateway = new ClerkAuthGateway({
    APP_ENV: 'local',
    CLERK_SECRET_KEY: requireEnv('CLERK_SECRET_KEY'),
  } as Env);
  let adminId: string | null = null;
  for (const email of (process.env.ADMIN_EMAILS ?? '').split(',').map((e) => e.trim())) {
    if (!email) continue;
    const u = await gateway.findUserByEmail(email);
    if (!u) continue;
    const { data: isAdmin } = await db.rpc('svc_is_admin', { p_user: u.id });
    if (isAdmin === true) {
      adminId = u.id;
      break;
    }
  }
  if (!adminId)
    throw new Error('No admin found in Clerk: run scripts/db/bootstrap-admin.ts first.');

  for (const ex of EXAMPLES) {
    const { starts, ends } = nineAmSaoPaulo(ex.daysAhead);
    const row = {
      title: ex.title,
      type: 'panfletagem',
      description: ex.description,
      description_sanitized: sanitizePlainText(ex.description),
      starts_at: starts,
      ends_at: ends,
      timezone: 'America/Sao_Paulo',
      public_address: ex.public_address,
      location_lat: ex.lat,
      location_lon: ex.lon,
      location_precision: 'exact',
      territory_id: ex.territory_id,
      status: 'published',
      public_contact_opt_in: false,
      public_contact_type: null,
      public_contact_value: null,
      reviewed_by: adminId,
      reviewed_at: new Date().toISOString(),
      cancelled_at: null,
    };
    const { data: existing, error: selErr } = await db
      .from('activities')
      .select('id,version')
      .eq('title', ex.title)
      .limit(2);
    if (selErr) throw new Error(`select failed (${selErr.code ?? 'unknown'})`);
    if (dryRun) {
      console.log(
        `seed-example: ${existing?.length ? 'would update' : 'would create'} "${ex.title}" ${starts}`,
      );
      continue;
    }
    if (existing && existing.length > 0) {
      const cur = existing[0]!;
      const { error } = await db
        .from('activities')
        .update({ ...row, version: (cur.version as number) + 1 })
        .eq('id', cur.id);
      if (error) throw new Error(`update failed (${error.code ?? 'unknown'})`);
      console.log(`seed-example: updated "${ex.title}" → ${starts}`);
    } else {
      const { data, error } = await db
        .from('activities')
        .insert({ ...row, creator_user_id: adminId })
        .select('id')
        .single();
      if (error) throw new Error(`insert failed (${error.code ?? 'unknown'}: ${error.message})`);
      console.log(`seed-example: created "${ex.title}" (${data.id}) → ${starts}`);
    }
  }
  if (dryRun) console.log('seed-example: --dry-run, nothing written.');
}

main().catch((e: unknown) => {
  console.error(`seed-example: ${e instanceof Error ? e.message : 'failed'}`);
  process.exit(1);
});
