/**
 * QA-2 (qa-security, independent) — LIVE checks: local `wrangler dev --env local` + TARGET dev.
 *
 * Skipped unless QA_WORKER_URL is set AND TARGET credentials are present in .dev.vars.
 * Sandbox territory `mg-97xxxxx` (impossible IBGE code) removed by cascade in afterAll;
 * ADR 0005: identities are throw-away users of the Clerk DEVELOPMENT instance with real session
 * tokens (scripts/db/clerk-test-users.ts), erased in afterAll. Only @example.org addresses.
 * Never prints secrets.
 *
 * `it.fails` = FINDING (assertion = secure expectation, fails today).
 * BE-3: Q02 fixed (confirm-email treats any profile -> verified transition as a promotion) and
 * flipped to `it`. BE-5: Q01–Q04 (Supabase Auth flows) replaced by their Clerk equivalents.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createClerkTestUser,
  deleteClerkTestUser,
  devClerk,
  type ClerkTestUser,
} from '../../scripts/db/clerk-test-users.ts';
import { loadDevVars } from '../../scripts/db/load-env.ts';

loadDevVars();
const URL_ = process.env.SUPABASE_TARGET_URL ?? '';
const ANON = process.env.SUPABASE_TARGET_ANON_KEY ?? '';
const SERVICE = process.env.SUPABASE_TARGET_SERVICE_ROLE_KEY ?? '';
const WORKER = process.env.QA_WORKER_URL ?? '';
const configured =
  Boolean(URL_ && ANON && SERVICE && WORKER && process.env.CLERK_SECRET_KEY) &&
  new URL(URL_ || 'http://x').hostname.startsWith('wnclh');

const opts = { auth: { persistSession: false, autoRefreshToken: false } };

describe.skipIf(!configured)('QA-2 live Worker + TARGET dev', () => {
  const tag = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  const muni = `mg-97${String(Math.floor(Math.random() * 1e5)).padStart(5, '0')}`;
  const hood = `${muni}-qa2-${tag}`;
  const ip = `198.51.100.${Math.floor(Math.random() * 250) + 1}`;
  const userIds: string[] = [];
  let svc: SupabaseClient;
  let seq = 0;
  const turnstile = () => `XXXX.DUMMY.TOKEN.qa2.${tag}.${++seq}`;

  async function api(
    path: string,
    init: {
      method?: string;
      token?: string;
      json?: unknown;
      headers?: Record<string, string>;
    } = {},
  ) {
    const headers: Record<string, string> = { 'CF-Connecting-IP': ip, ...init.headers };
    if (init.json !== undefined) headers['Content-Type'] = 'application/json';
    if (init.token) headers.Authorization = `Bearer ${init.token}`;
    const res = await fetch(`${WORKER}/api/v1${path}`, {
      method: init.method ?? 'GET',
      headers,
      body: init.json !== undefined ? JSON.stringify(init.json) : undefined,
    });
    const text = await res.text();
    let json: { data?: Record<string, unknown> & { items?: unknown[] }; error?: { code: string } } =
      {};
    try {
      json = JSON.parse(text) as typeof json;
    } catch {
      /* non-JSON */
    }
    return { res, text, json };
  }

  const clerk = configured ? devClerk() : null;
  async function clerkUser(label: string): Promise<ClerkTestUser> {
    const u = await createClerkTestUser(clerk!, `qa-clerk-qa2-${label}-${tag}@example.org`);
    userIds.push(u.id);
    return u;
  }

  const registration = (email: string) => ({
    display_name: 'Nome do Atacante QA2',
    email,
    phone: '(31) 98888-7777',
    territory_id: hood,
    terms_accepted: true,
    contact_opt_in: true,
    consent_version: '2026-10',
    turnstile_token: turnstile(),
  });

  beforeAll(async () => {
    svc = createClient(URL_, SERVICE, opts);
    const t = await svc.from('territories').insert([
      {
        id: muni,
        type: 'municipality',
        name: `QA2 ${tag}`,
        normalized_name: `qa2 ${tag}`,
        parent_id: 'mg',
        ibge_code: muni.slice(3),
        slug: tag,
        municipality_name: `QA2 ${tag}`,
        centroid_lon: -43.9,
        centroid_lat: -19.9,
        data_quality: 'demo',
      },
    ]);
    if (t.error) throw new Error(`territory muni: ${t.error.code}`);
    const h = await svc.from('territories').insert([
      {
        id: hood,
        type: 'neighborhood',
        name: `QA2 bairro ${tag}`,
        normalized_name: `qa2 bairro ${tag}`,
        parent_id: muni,
        slug: `qa2-${tag}`,
        municipality_name: `QA2 ${tag}`,
        centroid_lon: -43.9,
        centroid_lat: -19.9,
        data_quality: 'demo',
      },
    ]);
    if (h.error) throw new Error(`territory hood: ${h.error.code}`);
  });

  afterAll(async () => {
    if (!svc) return;
    // proposals are in app_private (not cascaded by territory); erase ours
    const props = await svc.rpc('svc_list_group_proposals', { p_status: null, p_limit: 51 });
    const mine = ((props.data ?? []) as { id: string; territory_id: string }[])
      .filter((p) => p.territory_id === muni || p.territory_id === hood)
      .map((p) => p.id);
    if (mine.length) await svc.rpc('svc_erase_group_proposals', { p_ids: mine });
    await svc.from('whatsapp_groups').delete().in('territory_id', [muni, hood]);
    await svc.from('territories').delete().eq('id', hood);
    await svc.from('territories').delete().eq('id', muni);
    for (const id of userIds) await deleteClerkTestUser(clerk!, svc, id);
  });

  // ADR 0005: Q01/Q02 (magic-link promotion / GoTrue email_change pre-hijack) and Q03/Q04
  // (Supabase MFA) targeted Supabase Auth flows that no longer exist. Their Clerk equivalents:
  it('Q01 (Clerk): an attacker cannot register a profile with someone else’s e-mail', async () => {
    const att = await clerkUser('att');
    const victimEmail = `mm-qa2-victim+${tag}@example.org`;
    const reg = await api('/registrations', {
      method: 'POST',
      token: await att.token(),
      json: registration(victimEmail),
    });
    expect(reg.res.status).toBe(400);
    expect(reg.text).not.toContain(victimEmail);
    const prof = await svc.rpc('svc_get_profile', { p_user: att.id });
    expect(prof.data).toBeNull();
    // with its own (Clerk-verified) e-mail the registration works and is verified at once
    const ok = await api('/registrations', {
      method: 'POST',
      token: await att.token(),
      json: registration(att.email),
    });
    expect(ok.res.status).toBe(201);
    expect(ok.json.data?.session_state).toBe('verified');
  });

  it('Q03 (Clerk): Supabase Auth is closed to clients (anonymous sign-in disabled)', async () => {
    const res = await fetch(`${URL_}/auth/v1/signup`, {
      method: 'POST',
      headers: { apikey: ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const j = (await res.json()) as { error_code?: string; code?: string | number };
    console.log('QA2_Q03_anonymous_signin', res.status, j.error_code ?? j.code ?? null);
    expect(res.status).toBeGreaterThanOrEqual(400);
    // a Supabase-issued token (if any) is not a Clerk session for the Worker
    const r = await api('/me', { token: ANON });
    expect(r.res.status).toBe(401);
  });

  it('Q05 Origin live: null / look-alike refused; loopback accepted in local', async () => {
    const path = '/activities/00000000-0000-4000-8000-000000000001/rsvp';
    for (const o of ['null', 'http://127.0.0.1.evil.com', 'https://evil.example']) {
      const r = await api(path, { method: 'POST', headers: { Origin: o } });
      expect([o, r.res.status]).toEqual([o, 403]);
    }
    const ok = await api(path, { method: 'POST', headers: { Origin: 'http://localhost:9999' } });
    expect(ok.res.status).not.toBe(403);
  });

  it('Q06 edge cache live: HIT on public GET; approve purges /groups; suspend purges fallback and busted URLs (BE-3)', async () => {
    const adm = await clerkUser('admin');
    const g = await svc.rpc('svc_grant_admin', { p_user: adm.id }); // admin by Clerk id
    expect(g.error).toBeNull();

    const muniUrl = `/groups?territory_id=${muni}`;
    const hoodUrl = `/groups?territory_id=${encodeURIComponent(hood)}`;
    const m1 = await api(muniUrl);
    const m2 = await api(muniUrl);
    console.log('QA2_Q06_cache', m1.res.headers.get('x-cache'), m2.res.headers.get('x-cache'));
    expect(m2.res.headers.get('x-cache')).toBe('HIT');

    const prop = await api('/groups/proposals', {
      method: 'POST',
      json: {
        territory_id: muni,
        name_proposed: 'Grupo QA2',
        join_url_proposed: `https://chat.whatsapp.com/QA2${tag}abcdef`,
        proposer_name: 'Pessoa QA2',
        proposer_email: `qa2-prop+${tag}@example.org`,
        proposer_phone: '(31) 98888-7777',
        responsibility_accepted: true,
        consent_version: '2026-10',
        turnstile_token: turnstile(),
      },
    });
    expect(prop.res.status).toBe(201);
    const ap = await api(`/admin/groups/${String(prop.json.data?.id)}/approve`, {
      method: 'POST',
      token: await adm.token(),
    });
    expect(ap.res.status).toBe(200);
    const groupId = String(ap.json.data?.group_id);
    const m3 = await api(muniUrl);
    console.log(
      'QA2_Q06_after_approve',
      m3.res.headers.get('x-cache'),
      'items=',
      m3.json.data?.items?.length,
    );
    expect(m3.json.data?.items?.length).toBe(1); // QA2-03 fixed: purged on approve
    // fill the neighborhood fallback cache with the (now visible) group
    const fresh = await api(`${muniUrl}&_=${tag}`);
    expect(fresh.json.data?.items?.length).toBe(1);
    const h1 = await api(hoodUrl);
    expect(h1.json.data?.items?.length).toBe(1);
    const sus = await api(`/admin/groups/${groupId}/suspend`, {
      method: 'POST',
      token: await adm.token(),
      json: { reason: 'QA2 suspensão' },
    });
    expect(sus.res.status).toBe(200);
    const m4 = await api(muniUrl);
    const h2 = await api(hoodUrl);
    const b2 = await api(`${muniUrl}&_=${tag}`);
    console.log(
      'QA2_Q06_after_suspend muni',
      m4.res.headers.get('x-cache'),
      m4.json.data?.items?.length,
      'hood',
      h2.res.headers.get('x-cache'),
      h2.json.data?.items?.length,
      'busted',
      b2.res.headers.get('x-cache'),
      b2.json.data?.items?.length,
    );
    expect(m4.json.data?.items?.length).toBe(0); // exact URL purged
    // QA2-04/04b fixed: neighborhood fallback purged; extra params share the canonical key
    expect(h2.json.data?.items?.length).toBe(0);
    expect(b2.json.data?.items?.length).toBe(0);
    // private routes never cached
    const me1 = await api('/me', { token: await adm.token() });
    const me2 = await api('/me', { token: await adm.token() });
    expect(me2.res.headers.get('x-cache')).toBeNull();
    expect(me1.res.headers.get('cache-control')).toBe('no-store');
    const rv = await api(`/admin/group-proposals/${String(prop.json.data?.id)}/reveal-contact`, {
      method: 'POST',
      token: await adm.token(),
    });
    // D35: an aal1 admin may reveal the contact. The 'proposal.reveal_contact' audit row is
    // written inside svc_reveal_proposal_contact (same transaction, 0010), and app_private is
    // not exposed through PostgREST, so a 200 here implies the audited read.
    expect(rv.res.status).toBe(200);
    expect(rv.res.headers.get('cache-control')).toBe('no-store');
    expect(rv.text).toContain(`qa2-prop+${tag}@example.org`);
  });

  it('Q07 errors never leak SQL/stack', async () => {
    const probes = [
      await api(`/activities?from=not-a-date`),
      await api(`/activities?bbox=1,2,3`),
      await api(`/territories/${encodeURIComponent("mg'; drop table x;--")}`),
      await api('/activities/00000000-0000-4000-8000-00000000zzzz'),
      await api('/groups?territory_id=mg-3140001%00'),
    ];
    for (const p of probes) {
      expect(p.res.status).toBeLessThan(500);
      expect(p.text).not.toMatch(/at \w+ \(|stack|SQLSTATE|PGRST|postgres|syntax error|relation /i);
    }
  });
});
