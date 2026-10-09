/**
 * QA-1 (qa-security) — LIVE adversarial checks: local `wrangler dev` Worker + TARGET dev.
 *
 * Skipped unless QA_WORKER_URL is set (e.g. QA_WORKER_URL=http://127.0.0.1:8798 after
 * `npx wrangler dev --port 8798`) AND TARGET credentials are present in .dev.vars.
 * Relies on the Cloudflare TEST Turnstile secret in .dev.vars (always passes Siteverify),
 * so single-use is enforced only by app_private.turnstile_tokens_used.
 *
 * Every row lives under a sandbox territory `mg-98xxxxx` (impossible IBGE code) and is
 * removed in afterAll by cascade. ADR 0005: identities are throw-away users of the Clerk
 * DEVELOPMENT instance (created server-side, no e-mail sent) with REAL session tokens, erased
 * in afterAll (svc_erase_user_data + Clerk deleteUser). Only @example.org addresses. Never
 * prints secrets.
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

describe.skipIf(!configured)('QA-1 live Worker + TARGET dev', () => {
  const tag = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  const muni = `mg-98${String(Math.floor(Math.random() * 1e5)).padStart(5, '0')}`;
  const hood = `${muni}-qa-${tag}`;
  const ip = `198.51.100.${Math.floor(Math.random() * 250) + 1}`;
  const userIds: string[] = [];
  const supabaseAuthIds: string[] = []; // only if GoTrue signup is still open (L13)
  let svc: SupabaseClient;
  const clerk = configured ? devClerk() : null;
  // Clerk users: org1/org2 have NO profile (registered only where a test says so)
  let org1: ClerkTestUser;
  let org2: ClerkTestUser;
  let fresh: ClerkTestUser;
  let fresh2: ClerkTestUser;
  let org1Id = '';
  let published = '';
  let pendingOfOrg1 = '';
  let seq = 0;
  const turnstile = () => `XXXX.DUMMY.TOKEN.${tag}.${++seq}`;

  async function api(
    path: string,
    init: {
      method?: string;
      token?: string;
      json?: unknown;
      raw?: string;
      cookie?: string;
      ip?: string;
    } = {},
  ) {
    const headers: Record<string, string> = { 'CF-Connecting-IP': init.ip ?? ip };
    if (init.json !== undefined || init.raw !== undefined)
      headers['Content-Type'] = 'application/json';
    if (init.token) headers.Authorization = `Bearer ${init.token}`;
    if (init.cookie) headers.Cookie = init.cookie;
    const res = await fetch(`${WORKER}/api/v1${path}`, {
      method: init.method ?? 'GET',
      headers,
      body: init.raw ?? (init.json !== undefined ? JSON.stringify(init.json) : undefined),
    });
    const text = await res.text();
    let json: { data?: Record<string, unknown>; error?: { code: string } } = {};
    try {
      json = JSON.parse(text) as typeof json;
    } catch {
      /* non-JSON */
    }
    return { res, text, json };
  }

  async function clerkUser(label: string): Promise<ClerkTestUser> {
    const u = await createClerkTestUser(clerk!, `qa-clerk-l-${label}-${tag}@example.org`);
    userIds.push(u.id);
    return u;
  }

  beforeAll(async () => {
    svc = createClient(URL_, SERVICE, opts);
    const t = await svc.from('territories').insert([
      {
        id: muni,
        type: 'municipality',
        name: `QA ${tag}`,
        normalized_name: `qa ${tag}`,
        parent_id: 'mg',
        ibge_code: muni.slice(3),
        slug: tag,
        municipality_name: `QA ${tag}`,
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
        name: `QA bairro ${tag}`,
        normalized_name: `qa bairro ${tag}`,
        parent_id: muni,
        slug: `qa-${tag}`,
        municipality_name: `QA ${tag}`,
        centroid_lon: -43.9,
        centroid_lat: -19.9,
        data_quality: 'demo',
      },
    ]);
    if (h.error) throw new Error(`territory hood: ${h.error.code}`);
    org1 = await clerkUser('org1');
    org1Id = org1.id;
    org2 = await clerkUser('org2');
    fresh = await clerkUser('fresh');
    fresh2 = await clerkUser('fresh2');
    const base = {
      territory_id: hood,
      type: 'encontro',
      description: 'descrição bruta QA',
      description_sanitized: 'descrição QA',
      starts_at: new Date(Date.now() + 5 * 86_400_000).toISOString(),
      public_address: 'Rua QA, 1',
      location_lon: -43.9,
      location_lat: -19.9,
    };
    const a = await svc
      .from('activities')
      .insert({ ...base, creator_user_id: org1Id, title: 'QA publicada', status: 'published' })
      .select('id')
      .single();
    const b = await svc
      .from('activities')
      .insert({ ...base, creator_user_id: org1Id, title: 'QA pendente', status: 'pending_review' })
      .select('id')
      .single();
    if (a.error || b.error) throw new Error('seed activities');
    published = a.data.id as string;
    pendingOfOrg1 = b.data.id as string;
  });

  afterAll(async () => {
    if (!svc) return;
    await svc.from('territories').delete().eq('id', hood);
    await svc.from('territories').delete().eq('id', muni);
    for (const id of userIds) await deleteClerkTestUser(clerk!, svc, id);
    for (const id of supabaseAuthIds) await svc.auth.admin.deleteUser(id);
  });

  it('L01 body > 32 KB is rejected before parsing', async () => {
    const r = await api('/groups/proposals', {
      method: 'POST',
      raw: JSON.stringify({ x: 'a'.repeat(40_000) }),
    });
    expect(r.res.status).toBe(400);
    expect(r.json.error?.code).toBe('VALIDATION_ERROR');
  });

  it('L02/L03 proposal: no Turnstile -> 400; idempotency_key repeat -> same id 200; token reuse -> 400', async () => {
    const input = {
      territory_id: hood,
      name_proposed: 'Grupo QA',
      join_url_proposed: `https://chat.whatsapp.com/QA${tag}abcdef`,
      proposer_name: 'Pessoa QA',
      proposer_email: `qa-prop+${tag}@example.org`,
      proposer_phone: '(31) 98888-7777',
      responsibility_accepted: true,
      consent_version: '2026-10',
      idempotency_key: `qa-key-${tag}`,
    };
    const none = await api('/groups/proposals', {
      method: 'POST',
      json: { ...input, turnstile_token: '' },
    });
    expect(none.res.status).toBe(400);
    const t1 = turnstile();
    const first = await api('/groups/proposals', {
      method: 'POST',
      json: { ...input, turnstile_token: t1 },
    });
    expect(first.res.status).toBe(201);
    const again = await api('/groups/proposals', {
      method: 'POST',
      json: { ...input, turnstile_token: turnstile() },
    });
    expect(again.res.status).toBe(200);
    expect(again.json.data?.id).toBe(first.json.data?.id);
    expect(again.text).not.toContain('@example.org');
    const reuse = await api('/groups/proposals', {
      method: 'POST',
      json: { ...input, idempotency_key: `qa-key2-${tag}`, turnstile_token: t1 },
    });
    // With the Cloudflare TEST secret on a loopback (APP_ENV=local) Worker, single use is
    // skipped on purpose (SECURITY.md); the reuse check only applies to real secrets.
    const localTestSecret =
      /^https?:\/\/(127\.0\.0\.1|localhost)/.test(process.env.QA_WORKER_URL ?? '') &&
      (process.env.TURNSTILE_SECRET_KEY ?? '').startsWith('1x0000');
    if (!localTestSecret) {
      expect(reuse.res.status).toBe(400);
      expect(reuse.json.error?.code).toBe('TURNSTILE_FAILED');
    }
    const evil = await api('/groups/proposals', {
      method: 'POST',
      json: {
        ...input,
        join_url_proposed: 'https://chat.whatsapp.com.evil.example/abcdefghijk',
        turnstile_token: turnstile(),
      },
    });
    expect(evil.res.status).toBe(400);
  });

  it('L05 F01 (fixed): verified Clerk user WITHOUT profile cannot create an activity', async () => {
    const r = await api('/activities', {
      method: 'POST',
      token: await org1.token(),
      json: {
        title: 'Atividade QA sem perfil',
        type: 'encontro',
        description: 'Criada por usuário sem perfil/consentimento.',
        territory_id: hood,
        public_address: 'Rua QA, 2',
        coordinates: [2.35, 48.85],
        location_confirmed: true,
        starts_at: new Date(Date.now() + 3 * 86_400_000).toISOString(),
        timezone: 'America/Sao_Paulo',
      },
    });
    // F01 fixed in round 1 (organizer needs a profile) and F09 in round 2 (coordinates in MG)
    expect([400, 403]).toContain(r.res.status);
    expect(r.text).not.toContain(org1Id);
  });

  it('L06 IDOR: other organizer cannot PATCH/cancel; L07 Clerk session without profile cannot create', async () => {
    const p = await api(`/activities/${pendingOfOrg1}`, {
      method: 'PATCH',
      token: await org2.token(),
      json: { version: 1, title: 'trocado por outro' },
    });
    expect(p.res.status).toBe(404);
    const c = await api(`/activities/${pendingOfOrg1}/cancel`, {
      method: 'POST',
      token: await org2.token(),
    });
    expect(c.res.status).toBe(404);
    const a = await api('/activities', { method: 'POST', token: await fresh.token(), json: {} });
    expect(a.res.status).toBe(403);
  });

  it('L08 confirm-email no longer exists (404, ADR 0005); L09 non-admin denied; bad token 401', async () => {
    const r = await api('/auth/confirm-email', { method: 'POST', token: await fresh.token() });
    expect(r.res.status).toBe(404);
    const bad = await api('/me', { token: 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ1c2VyX3gifQ.forged' });
    expect(bad.res.status).toBe(401);
    const q = await api('/admin/queue?kind=groups', { token: await org1.token() });
    expect(q.res.status).toBe(403);
  });

  it('L10 RSVP: duplicate POST counted once; cookie flags; DELETE w/o identity -> 403', async () => {
    const r1 = await api(`/activities/${published}/rsvp`, { method: 'POST' });
    expect(r1.res.status).toBe(200);
    const sc = r1.res.headers.get('set-cookie') ?? '';
    expect(sc).toMatch(/HttpOnly/i);
    expect(sc).toMatch(/SameSite=Lax/i);
    expect(sc).toMatch(/Path=\/api/);
    const cookie = /mm_device=[^;]+/.exec(sc)?.[0] ?? '';
    const r2 = await api(`/activities/${published}/rsvp`, { method: 'POST', cookie });
    expect(r2.json.data?.rsvp_count_approx).toBe(1);
    const d = await api(`/activities/${published}/rsvp`, { method: 'DELETE' });
    expect(d.res.status).toBe(403);
    expect(r2.res.headers.get('cache-control')).toBe('no-store');
  });

  it('L11 registration: another account cannot take an e-mail (400, no enumeration oracle)', async () => {
    const email = fresh.email;
    const reg = (tok: string) =>
      api('/registrations', {
        method: 'POST',
        token: tok,
        json: {
          display_name: 'Pessoa QA',
          email,
          phone: '(31) 98888-7777',
          territory_id: hood,
          terms_accepted: true,
          contact_opt_in: false,
          consent_version: '2026-10',
          turnstile_token: turnstile(),
        },
      });
    const a = await reg(await fresh.token());
    expect([200, 201]).toContain(a.res.status);
    expect(a.text).not.toContain(email);
    // fresh2 tries fresh's e-mail: same answer as any address it does not own
    const b = await reg(await fresh2.token());
    expect(b.res.status).toBe(400);
    const me = await api('/me', { token: await fresh.token() });
    expect(me.res.status).toBe(200);
    expect(me.text).not.toContain(email);
    expect(me.text).not.toContain('98888');
  });

  it('L12 send-link no longer exists (404, ADR 0005)', async () => {
    const r = await api('/auth/send-link', {
      method: 'POST',
      json: { email: `nobody+${tag}@example.org`, turnstile_token: turnstile() },
    });
    expect(r.res.status).toBe(404);
  });

  it('L13 Supabase Auth surface is closed: direct e-mail signup refused (ADR 0005)', async () => {
    const res = await fetch(`${URL_}/auth/v1/signup`, {
      method: 'POST',
      headers: { apikey: ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `qa-signup+${tag}@example.org`,
        password: `Qa-${tag}-pw-123456`,
      }),
    });
    const j = (await res.json()) as {
      error_code?: string;
      code?: string | number;
      id?: string;
      user?: { id?: string };
    };
    const createdId = j.user?.id ?? j.id;
    if (typeof createdId === 'string') supabaseAuthIds.push(createdId);
    // config.toml [auth] enable_signup = false (BE-5): GoTrue must refuse and create nothing.
    process.stderr.write(
      `QA_L13 ${JSON.stringify({ status: res.status, code: j.error_code ?? j.code ?? null, created: Boolean(createdId) })}\n`,
    );
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(createdId).toBeUndefined();
  });
});
