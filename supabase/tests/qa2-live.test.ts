/**
 * QA-2 (qa-security, independent) — LIVE checks: local `wrangler dev --env local` + TARGET dev.
 *
 * Skipped unless QA_WORKER_URL is set AND TARGET credentials are present in .dev.vars.
 * Sandbox territory `mg-97xxxxx` (impossible IBGE code) removed by cascade in afterAll;
 * every Auth user created is deleted. Only @example.org addresses. Never prints secrets.
 *
 * `it.fails` = FINDING (assertion = secure expectation, fails today).
 */
import { createHmac } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadDevVars } from '../../scripts/db/load-env.ts';

loadDevVars();
const URL_ = process.env.SUPABASE_TARGET_URL ?? '';
const ANON = process.env.SUPABASE_TARGET_ANON_KEY ?? '';
const SERVICE = process.env.SUPABASE_TARGET_SERVICE_ROLE_KEY ?? '';
const WORKER = process.env.QA_WORKER_URL ?? '';
const configured =
  Boolean(URL_ && ANON && SERVICE && WORKER) &&
  new URL(URL_ || 'http://x').hostname.startsWith('wnclh');

const opts = { auth: { persistSession: false, autoRefreshToken: false } };

function base32Decode(s: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const ch of s.replace(/=+$/, '').toUpperCase())
    bits += alphabet.indexOf(ch).toString(2).padStart(5, '0');
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}
function totp(secret: string, t = Date.now()): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(t / 30_000)));
  const h = createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const o = h[h.length - 1]! & 0xf;
  const code = (h.readUInt32BE(o) & 0x7fffffff) % 1_000_000;
  return String(code).padStart(6, '0');
}

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

  async function anon(): Promise<{ client: SupabaseClient; token: string; id: string }> {
    const client = createClient(URL_, ANON, opts);
    const s = await client.auth.signInAnonymously();
    if (s.error || !s.data.session) throw new Error(`anon: ${s.error?.code}`);
    userIds.push(s.data.user!.id);
    return { client, token: s.data.session.access_token, id: s.data.user!.id };
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
    for (const id of userIds) await svc.auth.admin.deleteUser(id);
  });

  it('Q01 P-SEC-1 core: after magic-link promotion the attacker access token is dead (cannot clear review)', async () => {
    const victimEmail = `mm-qa2-victim+${tag}@example.org`;
    const att = await anon();
    const reg = await api('/registrations', {
      method: 'POST',
      token: att.token,
      json: registration(victimEmail),
    });
    expect(reg.res.status).toBe(201);
    // victim clicks the magic link (simulated server-side; example.org never gets mail)
    const link = await svc.auth.admin.generateLink({ type: 'magiclink', email: victimEmail });
    expect(link.error).toBeNull();
    const vc = createClient(URL_, ANON, opts);
    const ver = await vc.auth.verifyOtp({
      type: 'magiclink',
      token_hash: link.data.properties?.hashed_token ?? '',
    });
    expect(ver.error).toBeNull();
    const conf = await api('/auth/confirm-email', {
      method: 'POST',
      token: ver.data.session!.access_token,
    });
    expect(conf.res.status).toBe(200);
    expect(conf.json.data?.profile_review_required).toBe(true);
    // attacker tries to clear the flag with the still-unexpired access token
    const clear = await api('/me', {
      method: 'PATCH',
      token: att.token,
      json: { profile_reviewed: true },
    });
    console.log('QA2_Q01_attacker_patch_status', clear.res.status, clear.json.error?.code);
    expect(clear.res.status).toBe(401);
    const refreshed = await att.client.auth.refreshSession();
    expect(refreshed.data.session).toBeNull();
  });

  it.fails(
    'Q02 P-SEC-1 bypass: promotion by GoTrue email_change skips review and keeps the attacker session',
    async () => {
      const attackerEmail = `mm-qa2-att+${tag}@example.org`;
      const victimEmail = `mm-qa2-victim2+${tag}@example.org`;
      const att = await anon();
      const reg = await api('/registrations', {
        method: 'POST',
        token: att.token,
        json: registration(attackerEmail),
      });
      expect(reg.res.status).toBe(201);
      // Equivalent of att.client.auth.updateUser({ email: victimEmail }) + victim clicking the
      // "confirm e-mail change" link (generated server-side: example.org never gets mail).
      // Secure e-mail change: the attacker confirms the CURRENT address (its own inbox), the
      // victim confirms the NEW one.
      const linkNew = await svc.auth.admin.generateLink({
        type: 'email_change_new',
        email: attackerEmail,
        newEmail: victimEmail,
      });
      const linkCur = await svc.auth.admin.generateLink({
        type: 'email_change_current',
        email: attackerEmail,
        newEmail: victimEmail,
      });
      console.log('QA2_Q02_generateLink', linkNew.error?.code ?? 'ok', linkCur.error?.code ?? 'ok');
      expect(linkNew.error).toBeNull();
      const ac = createClient(URL_, ANON, opts);
      const cur = await ac.auth.verifyOtp({
        type: 'email_change',
        email: attackerEmail,
        token: linkCur.data.properties?.email_otp ?? '',
      });
      console.log('QA2_Q02_verify_current', cur.error?.code ?? 'ok');
      const vc = createClient(URL_, ANON, opts);
      const ver = await vc.auth.verifyOtp({
        type: 'email_change',
        email: victimEmail,
        token: linkNew.data.properties?.email_otp ?? '',
      });
      console.log('QA2_Q02_verify', ver.error?.code ?? 'ok', 'anon=', ver.data.user?.is_anonymous);
      expect(ver.error).toBeNull();
      const victimTok = ver.data.session?.access_token;
      // the victim's browser lands on /autenticacao/retorno -> confirm-email
      const conf = await api('/auth/confirm-email', { method: 'POST', token: victimTok });
      console.log(
        'QA2_Q02_confirm',
        conf.res.status,
        conf.json.error?.code,
        'review=',
        conf.json.data?.profile_review_required,
      );
      // attacker refreshes its ORIGINAL session and acts as organizer
      const r = await att.client.auth.refreshSession();
      const attTok = r.data.session?.access_token;
      console.log('QA2_Q02_attacker_refresh', r.error?.code ?? 'ok', 'session=', Boolean(attTok));
      const act = attTok
        ? await api('/activities', {
            method: 'POST',
            token: attTok,
            json: {
              title: 'Atividade QA2 atacante',
              type: 'encontro',
              description: 'Criada com a sessão do atacante após promoção externa.',
              territory_id: hood,
              public_address: 'Rua QA2, 1',
              coordinates: [-43.9, -19.9],
              location_confirmed: true,
              starts_at: new Date(Date.now() + 3 * 86_400_000).toISOString(),
              timezone: 'America/Sao_Paulo',
            },
          })
        : null;
      console.log('QA2_Q02_attacker_activity', act?.res.status, act?.json.error?.code);
      if (act?.res.status === 201) {
        await svc.from('activities').delete().eq('id', String(act.json.data?.id));
      }
      // secure expectation: review flagged AND attacker can no longer act
      expect(conf.json.data?.profile_review_required).toBe(true);
      expect(act?.res.status ?? 401).not.toBe(201);
    },
  );

  it('Q03 MFA: anonymous session TOTP enrolment (report what GoTrue allows)', async () => {
    const a = await anon();
    const en = await a.client.auth.mfa.enroll({ factorType: 'totp', friendlyName: `qa2-${tag}` });
    console.log('QA2_Q03_anon_enroll', en.error?.code ?? 'ok');
    if (en.error || !en.data || en.data.type !== 'totp') return;
    const ch = await a.client.auth.mfa.challenge({ factorId: en.data.id });
    const vr = ch.data
      ? await a.client.auth.mfa.verify({
          factorId: en.data.id,
          challengeId: ch.data.id,
          code: totp(en.data.totp.secret),
        })
      : null;
    console.log('QA2_Q03_anon_verify', ch.error?.code ?? 'ok', vr?.error?.code ?? 'ok');
    const aal2Tok = vr?.data?.access_token;
    if (aal2Tok) {
      // aal2 anonymous session must still get nothing from admin routes
      const q = await api('/admin/queue', { token: aal2Tok });
      expect(q.res.status).toBe(403);
      const rev = await api(
        '/admin/group-proposals/00000000-0000-4000-8000-000000000001/reveal-contact',
        { method: 'POST', token: aal2Tok },
      );
      expect(rev.res.status).toBe(403);
    }
    // Observed 2026-10-09: GoTrue answers 403 no_authorization ("Anonymous user not allowed").
    expect(en.error).not.toBeNull();
  });

  it('Q04 MFA: removing a verified factor from an aal1 session is refused by GoTrue', async () => {
    const email = `mm-qa2-mfa+${tag}@example.org`;
    const cu = await svc.auth.admin.createUser({ email, email_confirm: true });
    expect(cu.error).toBeNull();
    userIds.push(cu.data.user!.id);
    const login = async () => {
      const l = await svc.auth.admin.generateLink({ type: 'magiclink', email });
      const c = createClient(URL_, ANON, opts);
      const v = await c.auth.verifyOtp({
        type: 'magiclink',
        token_hash: l.data.properties?.hashed_token ?? '',
      });
      if (v.error) throw new Error(`login ${v.error.code}`);
      return c;
    };
    const c1 = await login();
    const en = await c1.auth.mfa.enroll({ factorType: 'totp', friendlyName: `qa2b-${tag}` });
    expect(en.error).toBeNull();
    if (!en.data || en.data.type !== 'totp') return;
    const ch = await c1.auth.mfa.challenge({ factorId: en.data.id });
    const vr = await c1.auth.mfa.verify({
      factorId: en.data.id,
      challengeId: ch.data!.id,
      code: totp(en.data.totp.secret),
    });
    expect(vr.error).toBeNull();
    // a second, aal1 session (magic link only) tries to remove the factor / enrol another
    const c2 = await login();
    const un = await c2.auth.mfa.unenroll({ factorId: en.data.id });
    console.log('QA2_Q04_unenroll_from_aal1', un.error?.code ?? 'ok');
    expect(un.error).not.toBeNull();
    const en2 = await c2.auth.mfa.enroll({ factorType: 'totp', friendlyName: `qa2c-${tag}` });
    console.log('QA2_Q04_second_enroll_from_aal1', en2.error?.code ?? 'ok');
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

  it('Q06 edge cache live: HIT on public GET; approve does not purge /groups; suspend leaves fallback URL stale', async () => {
    const adm = await svc.auth.admin.createUser({
      email: `mm-qa2-admin+${tag}@example.org`,
      email_confirm: true,
    });
    userIds.push(adm.data.user!.id);
    const g = await svc.rpc('svc_grant_admin', { p_user: adm.data.user!.id });
    expect(g.error).toBeNull();
    const l = await svc.auth.admin.generateLink({
      type: 'magiclink',
      email: `mm-qa2-admin+${tag}@example.org`,
    });
    const ac = createClient(URL_, ANON, opts);
    const av = await ac.auth.verifyOtp({
      type: 'magiclink',
      token_hash: l.data.properties?.hashed_token ?? '',
    });
    const adminTok = av.data.session!.access_token; // aal1: local MFA bypass applies

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
      token: adminTok,
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
    // fill the neighborhood fallback cache with the (now visible) group
    const fresh = await api(`${muniUrl}&_=${tag}`);
    expect(fresh.json.data?.items?.length).toBe(1);
    const h1 = await api(hoodUrl);
    expect(h1.json.data?.items?.length).toBe(1);
    const sus = await api(`/admin/groups/${groupId}/suspend`, {
      method: 'POST',
      token: adminTok,
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
    // documented findings QA2-04/04b: stale for up to 60 s in the same colo
    expect(h2.json.data?.items?.length).toBe(1);
    expect(b2.json.data?.items?.length).toBe(1);
    // private routes never cached
    const me1 = await api('/me', { token: adminTok });
    const me2 = await api('/me', { token: adminTok });
    expect(me2.res.headers.get('x-cache')).toBeNull();
    expect(me1.res.headers.get('cache-control')).toBe('no-store');
    const rv = await api(`/admin/group-proposals/${String(prop.json.data?.id)}/reveal-contact`, {
      method: 'POST',
      token: adminTok,
    });
    expect(rv.res.status).toBe(403); // aal1 refused even in local
    expect(rv.text).not.toContain('qa2-prop');
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
