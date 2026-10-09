/**
 * Removes TEST data from the TARGET dev project (never the SOURCE, never production).
 *
 *   APP_ENV=local npx tsx scripts/db/cleanup-dev-data.ts            # dry run (default)
 *   APP_ENV=local npx tsx scripts/db/cleanup-dev-data.ts --yes      # executes
 *
 * Targets:
 *   - Auth users whose e-mail matches `fe2-*@…`, `*@example.org`, `mm-qa*`, `qa-*`
 *     (cascade: profiles, admins, activities they created, their RSVPs);
 *   - group proposals whose proposer e-mail matches the same patterns (audited erasure via
 *     svc_erase_group_proposals) and the groups created from them / by those users;
 *   - sandbox territories `mg-98*` / `mg-99*` (cascade: groups, proposals, activities, RSVPs).
 * Keeps: `admin.dev@minasemmovimento.local`, `audit_events`, `abuse_events`.
 *
 * Secrets come only from `.dev.vars` (service role over HTTPS); nothing secret is passed in
 * argv and no e-mail/PII is printed — only counts.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { assertTargetUrl, loadDevVars, requireEnv } from './load-env.ts';

const KEEP = new Set(['admin.dev@minasemmovimento.local']);
const execute = process.argv.includes('--yes');

export function isTestEmail(raw: string | null | undefined): boolean {
  const email = (raw ?? '').trim().toLowerCase();
  if (!email || KEEP.has(email)) return false;
  const local = email.split('@')[0] ?? '';
  return (
    local.startsWith('fe2-') ||
    email.endsWith('@example.org') ||
    local.startsWith('mm-qa') ||
    local.startsWith('qa-')
  );
}

function chunks<T>(list: T[], size = 100): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

async function main(): Promise<void> {
  if (process.env.APP_ENV !== 'local') {
    throw new Error('Refusing: set APP_ENV=local explicitly (dev TARGET only).');
  }
  loadDevVars();
  const url = requireEnv('SUPABASE_TARGET_URL');
  assertTargetUrl(url);
  const refFile = resolve(process.cwd(), 'supabase/.temp/project-ref');
  const ref = existsSync(refFile) ? readFileSync(refFile, 'utf8').trim() : '';
  if (!ref.startsWith('wnclh') || new URL(url).hostname.split('.')[0] !== ref) {
    throw new Error(
      'Refusing: linked project ref and SUPABASE_TARGET_URL do not match the TARGET.',
    );
  }
  console.log(
    `cleanup-dev-data: TARGET ${ref.slice(0, 5)}… mode=${execute ? 'EXECUTE' : 'dry-run'}`,
  );

  const svc = createClient(url, requireEnv('SUPABASE_TARGET_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ---------------------------------------------------------------- users
  const users: { id: string; email: string | null; is_anonymous: boolean }[] = [];
  for (let page = 1; ; page++) {
    const { data, error } = await svc.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`listUsers: ${error.code ?? error.status}`);
    users.push(
      ...data.users.map((u) => ({
        id: u.id,
        email: u.email ?? null,
        is_anonymous: u.is_anonymous === true,
      })),
    );
    if (data.users.length < 1000) break;
  }
  const targetUsers = users.filter((u) => isTestEmail(u.email)).map((u) => u.id);
  const anonymousNoEmail = users.filter((u) => u.is_anonymous && !u.email).length;

  let profiles = 0;
  for (const id of targetUsers) {
    const r = await svc.rpc('svc_get_profile', { p_user: id });
    if (r.data) profiles++;
  }
  let userActivities = 0;
  for (const part of chunks(targetUsers)) {
    const r = await svc
      .from('activities')
      .select('id', { count: 'exact', head: true })
      .in('creator_user_id', part);
    userActivities += r.count ?? 0;
  }

  // ---------------------------------------------------------------- proposals
  type P = { id: string; proposer_email: string; group_id: string | null; created_at: string };
  const proposals: P[] = [];
  let cursor: { at: string; id: string } | null = null;
  for (;;) {
    const r = await svc.rpc('svc_list_group_proposals', {
      p_status: null,
      p_limit: 50,
      p_cursor_created: cursor?.at ?? null,
      p_cursor_id: cursor?.id ?? null,
    });
    if (r.error) throw new Error(`list proposals: ${r.error.code}`);
    const page = (r.data ?? []) as P[];
    proposals.push(...page);
    if (page.length < 50) break;
    const last = page[page.length - 1]!;
    cursor = { at: last.created_at, id: last.id };
  }
  const targetProposals = proposals.filter((p) => isTestEmail(p.proposer_email));
  const proposalIds = targetProposals.map((p) => p.id);

  const groupIds = new Set<string>(
    targetProposals.map((p) => p.group_id).filter((g): g is string => Boolean(g)),
  );
  for (const part of chunks(proposalIds)) {
    const r = await svc.from('whatsapp_groups').select('id').in('source_proposal_id', part);
    for (const g of r.data ?? []) groupIds.add(g.id as string);
  }
  for (const part of chunks(targetUsers)) {
    const r = await svc.from('whatsapp_groups').select('id').in('created_by', part);
    for (const g of r.data ?? []) groupIds.add(g.id as string);
  }

  // ---------------------------------------------------------------- sandbox territories
  const sandbox = await svc
    .from('territories')
    .select('id,parent_id')
    .or('id.like.mg-98*,id.like.mg-99*');
  if (sandbox.error) throw new Error(`territories: ${sandbox.error.code}`);
  const sandboxIds = (sandbox.data ?? []).map((t) => t.id as string);
  let sandboxActivities = 0;
  let sandboxGroups = 0;
  for (const part of chunks(sandboxIds)) {
    sandboxActivities +=
      (
        await svc
          .from('activities')
          .select('id', { count: 'exact', head: true })
          .in('territory_id', part)
      ).count ?? 0;
    sandboxGroups +=
      (
        await svc
          .from('whatsapp_groups')
          .select('id', { count: 'exact', head: true })
          .in('territory_id', part)
      ).count ?? 0;
  }

  const summary = {
    auth_users_total: users.length,
    test_users: targetUsers.length,
    test_profiles: profiles,
    activities_by_test_users: userActivities,
    test_proposals: proposalIds.length,
    groups_linked_to_test_data: groupIds.size,
    sandbox_territories: sandboxIds.length,
    sandbox_activities: sandboxActivities,
    sandbox_groups: sandboxGroups,
    anonymous_users_without_email_kept: anonymousNoEmail,
  };
  console.log(JSON.stringify(summary, null, 2));
  if (!execute) {
    console.log('dry-run: nothing deleted. Re-run with --yes to execute.');
    return;
  }

  // ---------------------------------------------------------------- delete
  let deletedGroups = 0;
  for (const part of chunks([...groupIds])) {
    const r = await svc.from('whatsapp_groups').delete({ count: 'exact' }).in('id', part);
    if (r.error) throw new Error(`delete groups: ${r.error.code}`);
    deletedGroups += r.count ?? 0;
  }
  let erasedProposals = 0;
  for (const part of chunks(proposalIds)) {
    const r = await svc.rpc('svc_erase_group_proposals', {
      p_ids: part,
      p_request_id: 'cleanup-dev-data',
    });
    if (r.error) throw new Error(`erase proposals: ${r.error.code}`);
    erasedProposals += Number(r.data ?? 0);
  }
  let deletedUsers = 0;
  for (const id of targetUsers) {
    const r = await svc.auth.admin.deleteUser(id);
    if (!r.error) deletedUsers++;
  }
  // neighborhoods first (parent FK is RESTRICT), then municipalities
  const children = (sandbox.data ?? []).filter((t) => t.parent_id).map((t) => t.id as string);
  const parents = (sandbox.data ?? []).filter((t) => !t.parent_id).map((t) => t.id as string);
  let deletedTerritories = 0;
  for (const list of [children, parents]) {
    for (const part of chunks(list)) {
      const r = await svc.from('territories').delete({ count: 'exact' }).in('id', part);
      if (r.error) throw new Error(`delete territories: ${r.error.code}`);
      deletedTerritories += r.count ?? 0;
    }
  }
  console.log(
    JSON.stringify(
      {
        deleted_groups: deletedGroups,
        erased_proposals: erasedProposals,
        deleted_users: deletedUsers,
        deleted_sandbox_territories: deletedTerritories,
      },
      null,
      2,
    ),
  );
}

main().catch((e: unknown) => {
  console.error(`cleanup-dev-data: ${e instanceof Error ? e.message : 'failed'}`);
  process.exitCode = 1;
});
