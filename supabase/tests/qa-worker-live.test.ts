/**
 * QA-1 (qa-security) — LIVE adversarial checks: local `wrangler dev` Worker + TARGET dev.
 *
 * Skipped unless QA_WORKER_URL is set (e.g. QA_WORKER_URL=http://127.0.0.1:8798 after
 * `npx wrangler dev --port 8798`) AND TARGET credentials are present in .dev.vars.
 * Relies on the Cloudflare TEST Turnstile secret in .dev.vars (always passes Siteverify),
 * so single-use is enforced only by app_private.turnstile_tokens_used.
 *
 * Every row lives under a sandbox territory `mg-98xxxxx` (impossible IBGE code) and is
 * removed in afterAll by cascade; every Auth user created is deleted. Uses only
 * @example.org addresses (Supabase Auth refuses to send mail to that domain, so no e-mail
 * is delivered). Never prints secrets.
 */
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

describe.skipIf(!configured)('QA-1 live Worker + TARGET dev', () => {
  const tag = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  const muni = `mg-98${String(Math.floor(Math.random() * 1e5)).padStart(5, '0')}`;
  const hood = `${muni}-qa-${tag}`;
  const ip = `198.51.100.${Math.floor(Math.random() * 250) + 1}`;
  const userIds: string[] = [];
  let svc: SupabaseClient;
  let anonTok = '';
  let anonTok2 = '';
  let org1Tok = '';
  let org1Id = '';
  let org2Tok = '';
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

  async function verifiedSession(label: string): Promise<{ token: string; id: string }> {
    const email = `mm-qa-${label}+${tag}@example.org`;
    const { data, error } = await svc.auth.admin.createUser({ email, email_confirm: true });
    if (error || !data.user) throw new Error(`createUser ${label}: ${error?.code}`);
    userIds.push(data.user.id);
    const link = await svc.auth.admin.generateLink({ type: 'magiclink', email });
    const c = createClient(URL_, ANON, opts);
    const ver = await c.auth.verifyOtp({
      type: 'magiclink',
      token_hash: link.data.properties?.hashed_token ?? '',
    });
    if (ver.error || !ver.data.session) throw new Error(`verifyOtp ${label}: ${ver.error?.code}`);
    return { token: ver.data.session.access_token, id: data.user.id };
  }

  async function anonSession(): Promise<string> {
    const c = createClient(URL_, ANON, opts);
    const s = await c.auth.signInAnonymously();
    if (s.error || !s.data.session) throw new Error(`anon: ${s.error?.code}`);
    userIds.push(s.data.user!.id);
    return s.data.session.access_token;
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
    const o1 = await verifiedSession('org1');
    org1Tok = o1.token;
    org1Id = o1.id;
    org2Tok = (await verifiedSession('org2')).token;
    anonTok = await anonSession();
    anonTok2 = await anonSession();
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
    for (const id of userIds) await svc.auth.admin.deleteUser(id);
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
    expect(reuse.res.status).toBe(400);
    expect(reuse.json.error?.code).toBe('TURNSTILE_FAILED');
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

  it('L05 FINDING F01 live: verified Auth user WITHOUT profile creates an activity (201)', async () => {
    const r = await api('/activities', {
      method: 'POST',
      token: org1Tok,
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
    // documents current behaviour (finding F01 + F05: no profile, coordinates in Paris)
    expect(r.res.status).toBe(201);
    expect(r.text).not.toContain(org1Id);
  });

  it('L06 IDOR: other organizer cannot PATCH/cancel; L07 anon session cannot create', async () => {
    const p = await api(`/activities/${pendingOfOrg1}`, {
      method: 'PATCH',
      token: org2Tok,
      json: { version: 1, title: 'trocado por outro' },
    });
    expect(p.res.status).toBe(404);
    const c = await api(`/activities/${pendingOfOrg1}/cancel`, { method: 'POST', token: org2Tok });
    expect(c.res.status).toBe(404);
    const a = await api('/activities', { method: 'POST', token: anonTok, json: {} });
    expect(a.res.status).toBe(403);
  });

  it('L08 confirm-email with an anonymous session is refused; L09 non-admin denied', async () => {
    const r = await api('/auth/confirm-email', { method: 'POST', token: anonTok });
    expect(r.res.status).toBe(403);
    const q = await api('/admin/queue?kind=groups', { token: org1Tok });
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

  it('L11 registration: second provisional session with the same e-mail gets 409 (enumeration oracle)', async () => {
    const email = `qa-reg+${tag}@example.org`;
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
    const a = await reg(anonTok);
    expect([200, 201]).toContain(a.res.status);
    expect(a.text).not.toContain(email);
    const b = await reg(anonTok2);
    expect(b.res.status).toBe(409);
    const me = await api('/me', { token: anonTok });
    expect(me.res.status).toBe(200);
    expect(me.text).not.toContain(email);
    expect(me.text).not.toContain('98888');
  });

  it('L12 send-link: neutral 202, 4th call from the same IP -> 429 with Retry-After', async () => {
    const lip = `198.51.100.${(Number(ip.split('.')[3]) % 250) + 2}`;
    const statuses: number[] = [];
    let retry: string | null = null;
    for (let i = 0; i < 4; i++) {
      const r = await api('/auth/send-link', {
        method: 'POST',
        ip: lip,
        json: { email: `nobody${i}+${tag}@example.org`, turnstile_token: turnstile() },
      });
      statuses.push(r.res.status);
      if (r.res.status === 429) retry = r.res.headers.get('retry-after');
    }
    expect(statuses).toEqual([202, 202, 202, 429]);
    expect(Number(retry)).toBeGreaterThan(0);
  });

  it('L13 Auth surface: direct e-mail signup through the public anon key', async () => {
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
    if (typeof createdId === 'string') userIds.push(createdId);
    // Record the observed code; 'signup_disabled' would mean direct signup is closed.
    process.stderr.write(
      `QA_L13 ${JSON.stringify({ status: res.status, code: j.error_code ?? j.code ?? null, created: Boolean(createdId) })}\n`,
    );
    expect(res.status).toBeGreaterThan(0);
  });
});
