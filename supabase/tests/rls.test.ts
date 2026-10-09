/**
 * REAL RLS / grant tests against the TARGET dev project (never the SOURCE).
 *
 * ADR 0005 (migration 0012): identity is Clerk and the browser no longer talks to Supabase, so
 * there are no `authenticated` sessions any more (anonymous sign-ins are disabled). What is
 * verified here:
 *   - the `anon` key reaches NOTHING: no private table, no public table/view (territories,
 *     groups, activities — grants revoked in 0012), no function;
 *   - the public projections (views) still hide creator/moderation/raw fields, read with the
 *     service role exactly as the Worker reads them;
 *   - transactional functions and the Clerk-id format/`is_email_verified` semantics.
 * User ids are synthetic Clerk-format ids (`user_rls…`): the DB has no FK to any identity
 * table, so no Clerk user is needed. Every row lives under a sandbox territory (`mg-99xxxxx`,
 * an impossible IBGE code) removed in afterAll (cascade); profiles/admins are erased with
 * svc_erase_user_data.
 *
 * Run: npm run test:db   (loads .dev.vars; skipped when TARGET credentials are absent)
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
const PRIVATE_TABLES = [
  'profiles',
  'admins',
  'group_proposals',
  'group_managers',
  'activity_rsvps',
  'audit_events',
  'abuse_events',
  'turnstile_tokens_used',
];
const PUBLIC_RELATIONS = [
  'territories',
  'whatsapp_groups',
  'whatsapp_groups_public',
  'activities',
  'activities_public',
];
const DENIED = [401, 403, 404, 406];

describe.skipIf(!configured)('RLS & grants on TARGET dev (Clerk ids, no browser access)', () => {
  const tag = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  const muni = `mg-99${String(Math.floor(Math.random() * 1e5)).padStart(5, '0')}`;
  const hood = `${muni}-rls-${tag}`;
  const uid = (label: string) => `user_rls${label}${tag}`.replace(/[^A-Za-z0-9_]/g, '');
  const organizerId = uid('org');
  const otherOrganizerId = uid('org2');
  const pendingProfileId = uid('pending');
  const noProfileId = uid('none');
  const admins = [uid('admina'), uid('adminb')];
  const people = [organizerId, otherOrganizerId, pendingProfileId, noProfileId, ...admins];

  let svc: SupabaseClient;
  let anon: SupabaseClient;
  const ids = {
    activeGroup: '',
    pendingGroup: '',
    published: '',
    pending: '',
    otherPending: '',
    cancelled: '',
    proposal: '',
  };

  async function insertActivity(creator: string, status: string, title: string): Promise<string> {
    const { data, error } = await svc
      .from('activities')
      .insert({
        creator_user_id: creator,
        territory_id: hood,
        title,
        type: 'encontro',
        description: 'descrição interna <b>bruta</b>',
        description_sanitized: 'descrição pública',
        starts_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
        public_address: 'Rua de Teste RLS, 1',
        location_lon: -43.9,
        location_lat: -19.9,
        status,
        public_contact_opt_in: true,
        public_contact_type: 'instagram',
        public_contact_value: '@contato_rls',
        review_reason: 'nota interna de moderacao',
      })
      .select('id')
      .single();
    if (error || !data) throw new Error(`insert activity: ${error?.code}`);
    return data.id as string;
  }

  async function profile(userId: string, state: string): Promise<void> {
    const r = await svc.rpc('svc_create_profile', {
      p_user_id: userId,
      p_display_name: 'Perfil RLS',
      p_email: `mm-rls-${userId.toLowerCase()}@example.org`,
      p_phone: '+5531999990000',
      p_territory_id: hood,
      p_consent_version: 'v1',
      p_contact_opt_in: false,
      p_email_state: state,
    });
    if (r.error) throw new Error(`profile: ${r.error.code}`);
  }

  beforeAll(async () => {
    svc = createClient(URL_, SERVICE, opts);
    anon = createClient(URL_, ANON, opts);

    const t = await svc.from('territories').insert([
      {
        id: muni,
        type: 'municipality',
        name: `RLS Teste ${tag}`,
        normalized_name: `rls teste ${tag}`,
        slug: muni,
        data_quality: 'demo',
      },
      {
        id: hood,
        type: 'neighborhood',
        name: 'RLS Bairro',
        normalized_name: 'rls bairro',
        slug: hood,
        parent_id: muni,
        data_quality: 'demo',
      },
    ]);
    if (t.error) throw new Error(`territories: ${t.error.code}`);

    const g = await svc
      .from('whatsapp_groups')
      .insert([
        {
          territory_id: hood,
          display_name: 'RLS ativo',
          join_url: `https://chat.whatsapp.com/RLSactive${tag}`,
          status: 'active',
        },
        {
          territory_id: hood,
          display_name: 'RLS pendente',
          join_url: `https://chat.whatsapp.com/RLSpending${tag}`,
          status: 'pending',
        },
      ])
      .select('id,status');
    if (g.error || !g.data) throw new Error(`groups: ${g.error?.code}`);
    ids.activeGroup = g.data.find((r) => r.status === 'active')!.id as string;
    ids.pendingGroup = g.data.find((r) => r.status === 'pending')!.id as string;

    await profile(organizerId, 'verified');
    await profile(otherOrganizerId, 'verified');
    await profile(pendingProfileId, 'pending');
    ids.published = await insertActivity(organizerId, 'published', 'RLS publicada');
    ids.pending = await insertActivity(organizerId, 'pending_review', 'RLS pendente propria');
    ids.otherPending = await insertActivity(
      otherOrganizerId,
      'pending_review',
      'RLS pendente alheia',
    );
    ids.cancelled = await insertActivity(organizerId, 'cancelled', 'RLS cancelada');

    for (const id of admins) {
      const r = await svc.rpc('svc_grant_admin', { p_user: id });
      if (r.error) throw new Error(`grant admin: ${r.error.code}`);
    }
    const p = await svc.rpc('svc_create_group_proposal', {
      p_territory_id: hood,
      p_name: 'RLS proposta',
      p_join_url: `https://chat.whatsapp.com/RLSproposal${tag}`,
      p_proposer_name: 'Proponente RLS',
      p_proposer_email: `mm-rls-proposer+${tag}@example.org`,
      p_proposer_phone: '+5531988880000',
      p_proposer_user_id: organizerId,
      p_consent_version: 'v1',
      p_idempotency_hash: `rls-${tag}`,
      p_fingerprint_hash: null as unknown as string,
    });
    if (p.error) throw new Error(`proposal: ${p.error.code}`);
    ids.proposal = (p.data as { id: string }).id;
  });

  afterAll(async () => {
    if (!svc) return;
    // cascades: groups, proposals, managers, activities, rsvps
    await svc.from('territories').delete().eq('id', hood);
    await svc.from('territories').delete().eq('id', muni);
    for (const id of people) {
      await svc.rpc('svc_erase_user_data', { p_user: id, p_request_id: 'rls-test-cleanup' });
    }
  });

  describe('anon key reaches nothing', () => {
    it.each(PRIVATE_TABLES)(
      'anon cannot read app_private.%s (public path or Accept-Profile)',
      async (table) => {
        const viaPublic = await anon.from(table).select('*').limit(1);
        expect(viaPublic.data).toBeNull();
        expect(DENIED).toContain(viaPublic.status);
        const viaProfile = await anon.schema('app_private').from(table).select('*').limit(1);
        expect(viaProfile.data).toBeNull();
        expect(DENIED).toContain(viaProfile.status);
      },
    );

    it.each(PUBLIC_RELATIONS)(
      'anon cannot read public.%s any more (0012: no direct browser access)',
      async (rel) => {
        const r = await anon.from(rel).select('id').limit(1);
        expect(r.data).toBeNull();
        expect(DENIED).toContain(r.status);
      },
    );

    it('anon cannot insert or update groups/activities', async () => {
      const ins = await anon.from('whatsapp_groups').insert({
        territory_id: hood,
        display_name: 'Invasor',
        join_url: `https://chat.whatsapp.com/RLSinvasor${tag}`,
        status: 'active',
      });
      expect(DENIED).toContain(ins.status);
      const upd = await anon
        .from('whatsapp_groups')
        .update({ status: 'active' })
        .eq('id', ids.pendingGroup)
        .select('id');
      expect(upd.data ?? []).toEqual([]);
      const act = await anon.from('activities').insert({
        creator_user_id: organizerId,
        territory_id: hood,
        title: 'Atividade invasora',
        type: 'outro',
        description: 'x'.repeat(20),
        description_sanitized: 'x'.repeat(20),
        starts_at: new Date(Date.now() + 86_400_000).toISOString(),
        public_address: 'Rua invasora 1',
        location_lon: -43.9,
        location_lat: -19.9,
        status: 'published',
      });
      expect(DENIED).toContain(act.status);
      const check = await svc
        .from('whatsapp_groups')
        .select('status')
        .eq('id', ids.pendingGroup)
        .single();
      expect(check.data?.status).toBe('pending');
    });

    it('no function is executable by anon (svc_* and activity_rsvp_count)', async () => {
      const calls: [string, Record<string, unknown>][] = [
        ['svc_grant_admin', { p_user: noProfileId }],
        ['svc_get_profile', { p_user: organizerId }],
        ['svc_erase_user_data', { p_user: organizerId }],
        ['svc_dev_wipe_identities', {}],
        [
          'svc_upsert_rsvp',
          {
            p_activity: ids.published,
            p_user: null,
            p_subject_hash: 'a'.repeat(64),
            p_going: true,
          },
        ],
        ['svc_approve_group_proposal', { p_id: ids.proposal, p_admin: admins[0], p_reason: 'x' }],
        ['svc_consume_turnstile_token', { p_hash: 'b'.repeat(64) }],
        ['svc_email_in_use', { p_email: 'x@example.org', p_exclude: noProfileId }],
        ['activity_rsvp_count', { p_activity: ids.published }],
      ];
      for (const [fn, args] of calls) {
        const r = await anon.rpc(fn, args);
        expect(r.error, fn).not.toBeNull();
        expect(DENIED, fn).toContain(r.status);
      }
      const isAdmin = await svc.rpc('svc_is_admin', { p_user: noProfileId });
      expect(isAdmin.data).toBe(false);
      const profileGone = await svc.rpc('svc_get_profile', { p_user: organizerId });
      expect(profileGone.data).not.toBeNull(); // the anon erase attempt changed nothing
    });
  });

  describe('public projections (read by the Worker with the service role)', () => {
    it('groups view shows only active groups with the public projection', async () => {
      const r = await svc.from('whatsapp_groups_public').select('*').eq('territory_id', hood);
      expect(r.error).toBeNull();
      expect(r.data?.map((g) => g.id)).toEqual([ids.activeGroup]);
      expect(Object.keys(r.data![0]!).sort()).toEqual([
        'display_name',
        'id',
        'join_url',
        'status',
        'territory_id',
        'updated_at',
      ]);
    });

    it('activities view lists published/cancelled only and never exposes creator/moderation/raw fields', async () => {
      const r = await svc.from('activities_public').select('*').eq('territory_id', hood);
      expect(r.error).toBeNull();
      expect(r.data!.map((x) => x.id).sort()).toEqual([ids.published, ids.cancelled].sort());
      const keys = Object.keys(r.data![0]!);
      for (const forbidden of [
        'creator_user_id',
        'reviewed_by',
        'review_reason',
        'description',
        'public_contact_value',
        'version',
      ]) {
        expect(keys).not.toContain(forbidden);
      }
      expect(JSON.stringify(r.data)).not.toContain(organizerId);
    });

    it('T27: switching public contact off hides it immediately in the public view', async () => {
      const before = await svc
        .from('activities_public')
        .select('contact_public_value')
        .eq('id', ids.published)
        .single();
      expect(before.data?.contact_public_value).toBe('@contato_rls');
      await svc.from('activities').update({ public_contact_opt_in: false }).eq('id', ids.published);
      const after = await svc
        .from('activities_public')
        .select('contact_public_type,contact_public_value')
        .eq('id', ids.published)
        .single();
      expect(after.data).toEqual({ contact_public_type: null, contact_public_value: null });
    });

    it('rsvp count is aggregate only and 0 for non-public activities', async () => {
      const r = await svc.rpc('activity_rsvp_count', { p_activity: ids.otherPending });
      expect(r.data).toBe(0);
    });
  });

  describe('Clerk ids (0012)', () => {
    it('identity columns are text with the Clerk format; a uuid/garbage id is refused (23514)', async () => {
      const bad = await svc.rpc('svc_create_profile', {
        p_user_id: '00000000-0000-4000-8000-000000000001',
        p_display_name: 'Perfil uuid',
        p_email: `mm-rls-uuid+${tag}@example.org`,
        p_phone: '+5531999990000',
        p_territory_id: hood,
        p_consent_version: 'v1',
        p_contact_opt_in: false,
        p_email_state: 'verified',
      });
      expect(bad.error?.code).toBe('23514');
      const badAdmin = await svc.rpc('svc_grant_admin', { p_user: "user_x'; drop table x;--" });
      expect(badAdmin.error?.code).toBe('23514');
      const badErase = await svc.rpc('svc_erase_user_data', { p_user: 'not-a-clerk-id' });
      expect(badErase.error?.code).toBe('PT400');
    });

    it('is_email_verified follows profiles.email_verification_state + active account', async () => {
      const q = async (id: string) =>
        (await svc.rpc('svc_is_email_verified', { p_user: id })).data as boolean;
      expect([await q(organizerId), await q(pendingProfileId), await q(noProfileId)]).toEqual([
        true,
        false,
        false,
      ]);
    });

    it('email_in_use looks at other profiles (case-insensitive), excluding the caller', async () => {
      const email = `MM-RLS-${organizerId.toUpperCase()}@EXAMPLE.ORG`;
      const other = await svc.rpc('svc_email_in_use', { p_email: email, p_exclude: noProfileId });
      const self = await svc.rpc('svc_email_in_use', { p_email: email, p_exclude: organizerId });
      expect([other.data, self.data]).toEqual([true, false]);
    });
  });

  describe('transactional functions (service role)', () => {
    it('upsert_rsvp is idempotent per identity (device and Clerk user) and refuses cancelled activities', async () => {
      const subject = 'c'.repeat(64);
      const args = {
        p_activity: ids.published,
        p_user: null,
        p_subject_hash: subject,
        p_going: true,
      };
      const one = await svc.rpc('svc_upsert_rsvp', args);
      const two = await svc.rpc('svc_upsert_rsvp', args);
      expect(one.error).toBeNull();
      expect((two.data as { rsvp_count: number }).rsvp_count).toBe(1);
      const byUser = { ...args, p_user: otherOrganizerId, p_subject_hash: null };
      await svc.rpc('svc_upsert_rsvp', byUser);
      const byUser2 = await svc.rpc('svc_upsert_rsvp', byUser);
      expect((byUser2.data as { rsvp_count: number }).rsvp_count).toBe(2);
      const pub = await svc
        .from('activities_public')
        .select('rsvp_count')
        .eq('id', ids.published)
        .single();
      expect(pub.data?.rsvp_count).toBe(2);
      const other = await svc.rpc('svc_upsert_rsvp', {
        ...args,
        p_subject_hash: 'd'.repeat(64),
        p_going: false,
      });
      expect(other.error?.code).toBe('PT404'); // T11: another identity cannot cancel it
      const cancelled = await svc.rpc('svc_upsert_rsvp', { ...args, p_activity: ids.cancelled });
      expect(cancelled.error?.code).toBe('PT409');
      const pending = await svc.rpc('svc_upsert_rsvp', { ...args, p_activity: ids.pending });
      expect(pending.error?.code).toBe('PT404');
    });

    it('T28: two admins approving the same proposal concurrently create exactly one group', async () => {
      const [a, b] = await Promise.all(
        admins.map((adm) =>
          svc.rpc('svc_approve_group_proposal', {
            p_id: ids.proposal,
            p_admin: adm,
            p_reason: 'ok rls',
          }),
        ),
      );
      const results = [a!, b!];
      expect(results.filter((r) => r.error === null)).toHaveLength(1);
      expect(results.find((r) => r.error)?.error?.code).toBe('PT409');
      const groups = await svc
        .from('whatsapp_groups')
        .select('id,created_by,approved_by')
        .eq('source_proposal_id', ids.proposal);
      expect(groups.data).toHaveLength(1);
      expect(groups.data![0]!.created_by).toBe(organizerId);
      expect(admins).toContain(groups.data![0]!.approved_by);
    });

    it('approval by a non-admin (Clerk id not in admins) is refused inside the function', async () => {
      const r = await svc.rpc('svc_reject_group_proposal', {
        p_id: ids.proposal,
        p_admin: organizerId,
        p_reason: 'nao admin',
      });
      expect(r.error?.code).toBe('PT403');
    });

    it('turnstile token hash is single-use (T17)', async () => {
      const hash = (tag + 'f'.repeat(64)).slice(0, 64);
      const first = await svc.rpc('svc_consume_turnstile_token', {
        p_hash: hash,
        p_ttl_seconds: 60,
      });
      const second = await svc.rpc('svc_consume_turnstile_token', {
        p_hash: hash,
        p_ttl_seconds: 60,
      });
      expect([first.data, second.data]).toEqual([true, false]);
    });

    it('svc_erase_user_data removes RSVPs, activities, profile and admin row of one person', async () => {
      const victim = uid('erase');
      await profile(victim, 'verified');
      await svc.rpc('svc_grant_admin', { p_user: victim });
      const act = await insertActivity(victim, 'published', 'RLS apagar');
      await svc.rpc('svc_upsert_rsvp', {
        p_activity: ids.published,
        p_user: victim,
        p_subject_hash: null,
        p_going: true,
      });
      const r = await svc.rpc('svc_erase_user_data', { p_user: victim, p_request_id: 'rls' });
      expect(r.error).toBeNull();
      expect(r.data).toMatchObject({ rsvps: 1, activities: 1, profiles: 1, admins: 1 });
      const gone = await svc.from('activities').select('id').eq('id', act);
      expect(gone.data).toEqual([]);
      expect((await svc.rpc('svc_is_admin', { p_user: victim })).data).toBe(false);
    });
  });
});
