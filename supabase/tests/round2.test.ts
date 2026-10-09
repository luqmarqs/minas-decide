/**
 * Migration 0010 (BE-2) against the TARGET dev project (never the SOURCE): suspension,
 * audited reveal, profile review flag, proposal idempotency (F11), MG/duration CHECKs and
 * privileges of the new svc_* functions. Everything lives under a sandbox territory
 * (`mg-99xxxxx`) removed in afterAll; test users are deleted.
 *
 * Run: npm run test:db
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadDevVars } from '../../scripts/db/load-env.ts';

loadDevVars();
const URL_ = process.env.SUPABASE_TARGET_URL ?? '';
const ANON = process.env.SUPABASE_TARGET_ANON_KEY ?? '';
const SERVICE = process.env.SUPABASE_TARGET_SERVICE_ROLE_KEY ?? '';
const configured =
  Boolean(URL_ && ANON && SERVICE) && new URL(URL_ || 'http://x').hostname.startsWith('wnclh');
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const DENIED = [401, 403, 404, 406];

describe.skipIf(!configured)('migrations 0010/0011 on TARGET dev', () => {
  const tag = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  const muni = `mg-99${String(Math.floor(Math.random() * 1e5)).padStart(5, '0')}`;
  const userIds: string[] = [];
  let svc: SupabaseClient;
  let anon: SupabaseClient;
  let adminId = '';
  let userId = '';

  async function createUser(label: string): Promise<string> {
    const { data, error } = await svc.auth.admin.createUser({
      email: `mm-qa-r2-${label}+${tag}@example.org`,
      email_confirm: true,
    });
    if (error || !data.user) throw new Error(`createUser ${label}: ${error?.code}`);
    userIds.push(data.user.id);
    return data.user.id;
  }

  async function activity(status: string, over: Record<string, unknown> = {}) {
    return svc
      .from('activities')
      .insert({
        creator_user_id: userId,
        territory_id: muni,
        title: `R2 atividade ${status}`,
        type: 'encontro',
        description: 'x',
        description_sanitized: 'x',
        starts_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
        public_address: 'Rua de Teste R2, 1',
        location_lon: -43.9,
        location_lat: -19.9,
        status,
        ...over,
      })
      .select('id')
      .single();
  }

  async function proposal(hash: string | null, n: string) {
    return svc.rpc('svc_create_group_proposal', {
      p_territory_id: muni,
      p_name: 'R2 proposta',
      p_join_url: `https://chat.whatsapp.com/R2prop${tag}${n}`,
      p_proposer_name: 'Proponente R2',
      p_proposer_email: `mm-qa-r2-proposer+${tag}@example.org`,
      p_proposer_phone: '+5531988880000',
      p_proposer_user_id: null,
      p_consent_version: 'v1',
      p_idempotency_hash: hash,
      p_fingerprint_hash: null,
    });
  }

  beforeAll(async () => {
    svc = createClient(URL_, SERVICE, opts);
    anon = createClient(URL_, ANON, opts);
    const t = await svc.from('territories').insert({
      id: muni,
      type: 'municipality',
      name: `R2 Teste ${tag}`,
      normalized_name: `r2 teste ${tag}`,
      slug: muni,
      data_quality: 'demo',
    });
    if (t.error) throw new Error(`territory: ${t.error.code}`);
    adminId = await createUser('admin');
    userId = await createUser('user');
    const g = await svc.rpc('svc_grant_admin', { p_user: adminId });
    if (g.error) throw new Error(`grant: ${g.error.code}`);
  });

  afterAll(async () => {
    if (!svc) return;
    await svc.from('territories').delete().eq('id', muni); // cascades groups/proposals/activities
    for (const id of userIds) await svc.auth.admin.deleteUser(id);
  });

  it('new svc_* functions are not executable by anon', async () => {
    const fake = '00000000-0000-4000-8000-000000000000';
    for (const [fn, args] of [
      ['svc_reveal_proposal_contact', { p_id: fake, p_admin: fake }],
      ['svc_suspend_group', { p_id: fake, p_admin: fake, p_reason: 'xxx' }],
      ['svc_unsuspend_activity', { p_id: fake, p_admin: fake, p_reason: 'xxx' }],
      ['svc_erase_group_proposals', { p_ids: [fake] }],
      ['svc_update_profile', { p_user: fake, p_phone: '+5531999990000' }],
    ] as const) {
      const r = await anon.rpc(fn, args);
      expect(r.error, fn).not.toBeNull();
      expect(DENIED, fn).toContain(r.status);
    }
  });

  it('P-SEC-1: svc_update_profile sets/clears review_required_at and phone', async () => {
    const c = await svc.rpc('svc_create_profile', {
      p_user_id: userId,
      p_display_name: 'Perfil R2',
      p_email: `mm-qa-r2-user+${tag}@example.org`,
      p_phone: '+5531999990000',
      p_territory_id: muni,
      p_consent_version: 'v1',
      p_contact_opt_in: false,
      p_email_state: 'pending',
    });
    expect(c.error).toBeNull();
    const on = await svc.rpc('svc_update_profile', {
      p_user: userId,
      p_email_state: 'verified',
      p_review_required: true,
    });
    expect((on.data as { review_required_at: string | null }).review_required_at).not.toBeNull();
    const off = await svc.rpc('svc_update_profile', {
      p_user: userId,
      p_phone: '+5531966665544',
      p_review_required: false,
    });
    const row = off.data as { review_required_at: string | null; phone_e164: string };
    expect(row.review_required_at).toBeNull();
    expect(row.phone_e164).toBe('+5531966665544');
    const bad = await svc.rpc('svc_update_profile', { p_user: userId, p_phone: '123' });
    expect(bad.error?.code).toBe('23514');
  });

  it('suspended group leaves the public view; transitions are checked and audited', async () => {
    const ins = await svc
      .from('whatsapp_groups')
      .insert({
        territory_id: muni,
        display_name: 'R2 grupo',
        join_url: `https://chat.whatsapp.com/R2group${tag}`,
        status: 'active',
      })
      .select('id')
      .single();
    const gid = ins.data!.id as string;
    const visible = async () =>
      (await anon.from('whatsapp_groups_public').select('id').eq('id', gid)).data?.length;
    expect(await visible()).toBe(1);
    const noAdmin = await svc.rpc('svc_suspend_group', {
      p_id: gid,
      p_admin: userId,
      p_reason: 'abuso',
    });
    expect(noAdmin.error?.code).toBe('PT403');
    const noReason = await svc.rpc('svc_suspend_group', {
      p_id: gid,
      p_admin: adminId,
      p_reason: '',
    });
    expect(noReason.error?.code).toBe('PT422');
    const s1 = await svc.rpc('svc_suspend_group', {
      p_id: gid,
      p_admin: adminId,
      p_reason: 'abuso r2',
      p_request_id: `r2-${tag}`,
    });
    expect((s1.data as { status: string }).status).toBe('suspended');
    expect(await visible()).toBe(0);
    const base = await anon.from('whatsapp_groups').select('id').eq('id', gid);
    expect(base.data ?? []).toHaveLength(0);
    const s2 = await svc.rpc('svc_suspend_group', {
      p_id: gid,
      p_admin: adminId,
      p_reason: 'outra',
    });
    expect(s2.error?.code).toBe('PT409');
    const un = await svc.rpc('svc_unsuspend_group', {
      p_id: gid,
      p_admin: adminId,
      p_reason: 'revisado',
    });
    expect((un.data as { status: string }).status).toBe('active');
    expect(await visible()).toBe(1);
  });

  it('suspended activity is not public, refuses RSVP; unsuspend -> pending_review', async () => {
    const a = await activity('published');
    const id = a.data!.id as string;
    const s = await svc.rpc('svc_suspend_activity', {
      p_id: id,
      p_admin: adminId,
      p_reason: 'denúncia',
    });
    expect(typeof s.data).toBe('number');
    expect((await anon.from('activities_public').select('id').eq('id', id)).data).toHaveLength(0);
    const rsvp = await svc.rpc('svc_upsert_rsvp', {
      p_activity: id,
      p_user: null,
      p_subject_hash: 'e'.repeat(64),
      p_going: true,
    });
    expect(rsvp.error?.code).toBe('PT404');
    await svc.rpc('svc_unsuspend_activity', { p_id: id, p_admin: adminId, p_reason: 'ok r2' });
    const row = await svc.from('activities').select('status').eq('id', id).single();
    expect(row.data?.status).toBe('pending_review');
    const rejected = await activity('rejected');
    const bad = await svc.rpc('svc_suspend_activity', {
      p_id: rejected.data!.id,
      p_admin: adminId,
      p_reason: 'x r2',
    });
    expect(bad.error?.code).toBe('PT409');
  });

  it('F09/F12 CHECKs: outside MG or longer than 24 h -> 23514', async () => {
    const out = await activity('pending_review', { location_lon: -38.5, location_lat: -12.9 });
    expect(out.error?.code).toBe('23514');
    const start = Date.now() + 7 * 86_400_000;
    const long = await activity('pending_review', {
      starts_at: new Date(start).toISOString(),
      ends_at: new Date(start + 25 * 3_600_000).toISOString(),
    });
    expect(long.error?.code).toBe('23514');
  });

  it('F11: a decided proposal releases its key; pending one dedupes; reveal + group_id + erase', async () => {
    const hash = `r2-idem-${tag}`;
    const p1 = (await proposal(hash, 'a')).data as { id: string; created: boolean };
    const p2 = (await proposal(hash, 'a')).data as { id: string; created: boolean };
    expect(p1.created).toBe(true);
    expect(p2).toMatchObject({ id: p1.id, created: false });
    const rej = await svc.rpc('svc_reject_group_proposal', {
      p_id: p1.id,
      p_admin: adminId,
      p_reason: 'rejeitada r2',
    });
    expect(rej.error).toBeNull();
    const p3 = (await proposal(hash, 'a')).data as { id: string; created: boolean };
    expect(p3.created).toBe(true);
    expect(p3.id).not.toBe(p1.id);

    const denied = await svc.rpc('svc_reveal_proposal_contact', { p_id: p3.id, p_admin: userId });
    expect(denied.error?.code).toBe('PT403');
    const rev = await svc.rpc('svc_reveal_proposal_contact', {
      p_id: p3.id,
      p_admin: adminId,
      p_request_id: `r2-${tag}`,
    });
    expect(rev.data).toMatchObject({ proposal_id: p3.id, proposer_phone: '+5531988880000' });

    // 0011 (QA2-03): the RPC returns {group_id, territory_id}
    const approved = (
      await svc.rpc('svc_approve_group_proposal', {
        p_id: p3.id,
        p_admin: adminId,
        p_reason: 'ok',
      })
    ).data as { group_id: string; territory_id: string };
    expect(approved.territory_id).toBe(muni);
    const gid = approved.group_id;
    const list = await svc.rpc('svc_list_group_proposals', { p_status: 'active', p_limit: 50 });
    const item = (list.data as { id: string; group_id: string | null }[]).find(
      (x) => x.id === p3.id,
    );
    expect(item?.group_id).toBe(gid);

    const erased = await svc.rpc('svc_erase_group_proposals', { p_ids: [p1.id] });
    expect(erased.data).toBe(1);
  });

  // ------------------------------------------------------------ migration 0011 (BE-3 / QA-2)
  it('0011 QA2-09: unsuspend restores inactive groups and cancelled activities', async () => {
    const ins = await svc
      .from('whatsapp_groups')
      .insert({
        territory_id: muni,
        display_name: 'R2 grupo inativo',
        join_url: `https://chat.whatsapp.com/R2inact${tag}`,
        status: 'inactive',
      })
      .select('id')
      .single();
    const gid = ins.data!.id as string;
    await svc.rpc('svc_suspend_group', { p_id: gid, p_admin: adminId, p_reason: 'abuso q2' });
    const un = await svc.rpc('svc_unsuspend_group', {
      p_id: gid,
      p_admin: adminId,
      p_reason: 'revisado q2',
    });
    expect((un.data as { status: string }).status).toBe('inactive');
    const g = await svc
      .from('whatsapp_groups')
      .select('status,status_before_suspension')
      .eq('id', gid)
      .single();
    expect(g.data).toEqual({ status: 'inactive', status_before_suspension: null });

    const a = await activity('cancelled');
    const id = a.data!.id as string;
    const s = await svc.rpc('svc_suspend_activity', {
      p_id: id,
      p_admin: adminId,
      p_reason: 'denúncia q2',
    });
    expect(typeof s.data).toBe('number');
    const u = await svc.rpc('svc_unsuspend_activity', {
      p_id: id,
      p_admin: adminId,
      p_reason: 'ok q2',
    });
    expect(u.data).toMatchObject({ status: 'cancelled' });
    expect(typeof (u.data as { version: number }).version).toBe('number');
    const missing = await svc.rpc('svc_unsuspend_activity', {
      p_id: '00000000-0000-4000-8000-000000000000',
      p_admin: adminId,
      p_reason: 'ok q2',
    });
    expect(missing.error?.code).toBe('PT404');
    // the new column is not part of the anon column grants
    const leak = await anon.from('activities').select('status_before_suspension').limit(1);
    expect(leak.error).not.toBeNull();
    const leakG = await anon.from('whatsapp_groups').select('status_before_suspension').limit(1);
    expect(leakG.error).not.toBeNull();
  });

  it('0011 QA2-03: reject returns the territory; QA2-01: p_email_contact re-syncs the profile', async () => {
    const p = (await proposal(null, 'rej')).data as { id: string };
    const rej = await svc.rpc('svc_reject_group_proposal', {
      p_id: p.id,
      p_admin: adminId,
      p_reason: 'rejeitada q2',
    });
    expect(rej.data).toEqual({ proposal_id: p.id, territory_id: muni });
    const again = await svc.rpc('svc_reject_group_proposal', {
      p_id: p.id,
      p_admin: adminId,
      p_reason: 'de novo q2',
    });
    expect(again.error?.code).toBe('PT409');

    const upd = await svc.rpc('svc_update_profile', {
      p_user: userId,
      p_email_contact: `mm-qa-r2-novo+${tag}@example.org`,
    });
    expect((upd.data as { email_contact: string }).email_contact).toBe(
      `mm-qa-r2-novo+${tag}@example.org`,
    );
    const keep = await svc.rpc('svc_update_profile', { p_user: userId, p_display_name: 'Outro' });
    expect((keep.data as { email_contact: string }).email_contact).toBe(
      `mm-qa-r2-novo+${tag}@example.org`,
    );
    const denied = await anon.rpc('svc_update_profile', {
      p_user: userId,
      p_email_contact: 'x@example.org',
    });
    expect(DENIED).toContain(denied.status);
  });
});
