/**
 * Removes TEST data from the TARGET dev project (never the SOURCE, never production).
 *
 *   APP_ENV=local npx tsx scripts/db/cleanup-dev-data.ts              # dry run (default)
 *   APP_ENV=local npx tsx scripts/db/cleanup-dev-data.ts --yes        # executes
 *   APP_ENV=local npx tsx scripts/db/cleanup-dev-data.ts --yes --all  # + wipe ALL identities
 *
 * Targets (default):
 *   - Clerk users (ADR 0005) whose e-mails all match `fe2-*@…`, `*@example.org`, `mm-qa*`,
 *     `qa-*`: their DB rows are erased with `svc_erase_user_data` (RSVPs, activities, profile,
 *     admin row) and the Clerk user is deleted;
 *   - legacy Supabase Auth users with the same patterns (before 0012 the FK cascade removes
 *     profiles, admins, activities and RSVPs);
 *   - group proposals whose proposer e-mail matches the same patterns (audited erasure via
 *     svc_erase_group_proposals) and the groups created from them;
 *   - sandbox territories `mg-98*` / `mg-99*` (cascade: groups, proposals, activities, RSVPs).
 * `--all` (BE-5, migration to Clerk): additionally deletes EVERY legacy Supabase Auth user,
 * EVERY group proposal and the DB rows of EVERY identity. QA3-09 (migration 0013): this used to
 * call `svc_dev_wipe_identities`, a database function without an environment guard; it was
 * dropped and the wipe is done here with explicit service-role calls, behind the guards below:
 *   1. `svc_erase_user_data` (audited, one person at a time) for every Clerk user of the DEV
 *      instance (test or not) and every `activities.creator_user_id`;
 *   2. explicit delete of any remaining `public.activities` row (their RSVPs cascade).
 * Limitation: `app_private` is not exposed by the Data API, so a profile/admin row whose Clerk
 * user no longer exists and that created no activity cannot be enumerated here; such orphans
 * are prevented by the `user.deleted` webhook (QA3-02) and can be erased with
 * `svc_erase_user_data` when the id is known. Clerk users that are not test users are kept
 * (the owner's admin row is re-created by scripts/db/bootstrap-admin.ts). Keeps
 * `audit_events`, `abuse_events`, groups that did not come from a test proposal and the
 * territories.
 *
 * Guards (all must hold): APP_ENV=local; the linked project ref starts with the TARGET prefix
 * (`wnclh`) and equals the SUPABASE_TARGET_URL host; CLERK_SECRET_KEY, when present, is a
 * development key (`sk_test_`).
 *
 * Secrets come only from `.dev.vars` (service role / Clerk dev secret over HTTPS); nothing
 * secret is passed in argv and no e-mail/PII/id is printed — only counts.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClerkClient } from '@clerk/backend';
import { createClient } from '@supabase/supabase-js';
import { assertTargetUrl, loadDevVars, requireEnv } from './load-env.ts';

const KEEP = new Set(['admin.dev@minasemmovimento.local']);
const CLERK_ID = /^user_[A-Za-z0-9]{1,64}$/;
const execute = process.argv.includes('--yes');
const wipeAll = process.argv.includes('--all');

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

/** PostgREST "function not found" (svc_* created by a migration not applied yet). */
function missingFunction(err: { code?: string } | null): boolean {
  return err?.code === 'PGRST202' || err?.code === '42883';
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
  const clerkKey = process.env.CLERK_SECRET_KEY ?? '';
  if (clerkKey && !clerkKey.startsWith('sk_test_')) {
    throw new Error('Refusing: CLERK_SECRET_KEY is not a development (sk_test_) key.');
  }
  console.log(
    `cleanup-dev-data: TARGET ${ref.slice(0, 5)}… mode=${execute ? 'EXECUTE' : 'dry-run'}${wipeAll ? ' +all' : ''}`,
  );

  const svc = createClient(url, requireEnv('SUPABASE_TARGET_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const clerk = clerkKey ? createClerkClient({ secretKey: clerkKey }) : null;

  // ---------------------------------------------------------------- Clerk users (test only)
  const clerkTestUsers: string[] = [];
  const clerkAllUsers: string[] = [];
  let clerkTotal = 0;
  if (clerk) {
    for (let offset = 0; ; offset += 100) {
      const page = await clerk.users.getUserList({ limit: 100, offset });
      clerkTotal += page.data.length;
      for (const u of page.data) {
        clerkAllUsers.push(u.id);
        const emails = u.emailAddresses.map((e) => e.emailAddress);
        if (emails.length > 0 && emails.every((e) => isTestEmail(e))) clerkTestUsers.push(u.id);
      }
      if (page.data.length < 100) break;
    }
  }

  // ---------------------------------------------------------------- legacy Supabase Auth users
  const legacyUsers: { id: string; email: string | null }[] = [];
  for (let page = 1; ; page++) {
    const { data, error } = await svc.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`listUsers: ${error.code ?? error.status}`);
    legacyUsers.push(...data.users.map((u) => ({ id: u.id, email: u.email ?? null })));
    if (data.users.length < 1000) break;
  }
  const legacyTargets = legacyUsers.filter((u) => wipeAll || isTestEmail(u.email)).map((u) => u.id);

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
  const testProposals = proposals.filter((p) => isTestEmail(p.proposer_email));
  const proposalIds = (wipeAll ? proposals : testProposals).map((p) => p.id);

  // groups are removed only when they came from a TEST proposal (public records otherwise)
  const groupIds = new Set<string>(
    testProposals.map((p) => p.group_id).filter((g): g is string => Boolean(g)),
  );
  for (const part of chunks(testProposals.map((p) => p.id))) {
    const r = await svc.from('whatsapp_groups').select('id').in('source_proposal_id', part);
    for (const g of r.data ?? []) groupIds.add(g.id as string);
  }

  // ---------------------------------------------------------------- sandbox territories
  const sandbox = await svc
    .from('territories')
    .select('id,parent_id')
    .or('id.like.mg-98*,id.like.mg-99*');
  if (sandbox.error) throw new Error(`territories: ${sandbox.error.code}`);
  const sandboxIds = (sandbox.data ?? []).map((t) => t.id as string);

  const activitiesTotal =
    (await svc.from('activities').select('id', { count: 'exact', head: true })).count ?? 0;

  // --all: every identity we can enumerate with the service role (see the header limitation)
  const wipeIds = new Set<string>();
  if (wipeAll) {
    for (const id of clerkAllUsers) wipeIds.add(id);
    for (let from = 0; ; from += 1000) {
      const r = await svc
        .from('activities')
        .select('creator_user_id')
        .order('id')
        .range(from, from + 999);
      if (r.error) throw new Error(`list activity creators: ${r.error.code}`);
      for (const a of r.data ?? []) {
        const id = String((a as { creator_user_id: string }).creator_user_id);
        if (CLERK_ID.test(id)) wipeIds.add(id);
      }
      if ((r.data ?? []).length < 1000) break;
    }
  }

  console.log(
    JSON.stringify(
      {
        clerk_users_total: clerkTotal,
        clerk_test_users: clerkTestUsers.length,
        legacy_auth_users_total: legacyUsers.length,
        legacy_auth_users_targeted: legacyTargets.length,
        activities_total: activitiesTotal,
        identities_to_wipe: wipeIds.size,
        proposals_total: proposals.length,
        proposals_targeted: proposalIds.length,
        groups_linked_to_test_proposals: groupIds.size,
        sandbox_territories: sandboxIds.length,
      },
      null,
      2,
    ),
  );
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
  let deletedClerkUsers = 0;
  if (clerk) {
    for (const id of clerkTestUsers) {
      const r = await svc.rpc('svc_erase_user_data', {
        p_user: id,
        p_request_id: 'cleanup-dev-data',
      });
      if (r.error && !missingFunction(r.error)) throw new Error(`erase user: ${r.error.code}`);
      try {
        await clerk.users.deleteUser(id);
        deletedClerkUsers++;
      } catch {
        // already gone
      }
    }
  }
  let deletedLegacy = 0;
  for (const id of legacyTargets) {
    const r = await svc.auth.admin.deleteUser(id);
    if (!r.error) deletedLegacy++;
  }
  let wiped: unknown = 'skipped';
  if (wipeAll) {
    const totals = { identities: 0, rsvps: 0, activities: 0, profiles: 0, admins: 0 };
    for (const id of wipeIds) {
      const r = await svc.rpc('svc_erase_user_data', {
        p_user: id,
        p_request_id: 'cleanup-dev-data',
      });
      if (r.error) throw new Error(`erase user: ${r.error.code}`);
      const d = (r.data ?? {}) as Partial<
        Record<'rsvps' | 'activities' | 'profiles' | 'admins', number>
      >;
      totals.identities++;
      totals.rsvps += d.rsvps ?? 0;
      totals.activities += d.activities ?? 0;
      totals.profiles += d.profiles ?? 0;
      totals.admins += d.admins ?? 0;
    }
    // anything left (e.g. legacy ids before 0012): explicit delete, RSVPs cascade
    const d = await svc.from('activities').delete({ count: 'exact' }).not('id', 'is', null);
    if (d.error) throw new Error(`delete activities: ${d.error.code}`);
    wiped = { ...totals, remaining_activities_deleted: d.count ?? 0 };
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
        deleted_clerk_test_users: deletedClerkUsers,
        deleted_legacy_auth_users: deletedLegacy,
        wiped_identities: wiped,
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
