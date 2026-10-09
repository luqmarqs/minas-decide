/**
 * BE-5 / ADR 0005 — LIVE end-to-end with the REAL Clerk development instance: local
 * `wrangler dev --env local` Worker + TARGET dev + Clerk Backend API.
 *
 * Skipped unless QA_WORKER_URL is set AND TARGET + CLERK_SECRET_KEY (sk_test_) are present in
 * .dev.vars. Two throw-away Clerk users (`qa-clerk-<ts>@example.org`, created server-side; no
 * e-mail is sent) get REAL session tokens (60 s JWTs minted through the Backend API) and walk
 * the flow: registration -> /me -> create activity -> admin (by Clerk id) approves -> RSVP with
 * the session (idempotent) -> cancel RSVP. Everything is erased in afterAll
 * (svc_erase_user_data + Clerk deleteUser; sandbox territory `mg-96xxxxx` by cascade).
 * Never prints tokens, ids or e-mails.
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
const SERVICE = process.env.SUPABASE_TARGET_SERVICE_ROLE_KEY ?? '';
const WORKER = process.env.QA_WORKER_URL ?? '';
const CLERK = process.env.CLERK_SECRET_KEY ?? '';
const configured =
  Boolean(URL_ && SERVICE && WORKER && CLERK.startsWith('sk_test_')) &&
  new URL(URL_ || 'http://x').hostname.startsWith('wnclh');

const opts = { auth: { persistSession: false, autoRefreshToken: false } };

describe.skipIf(!configured)('Clerk live: registration -> /me -> activity -> RSVP', () => {
  const ts = Date.now();
  const tag = `${ts.toString(36)}${Math.floor(Math.random() * 1e4)}`;
  const muni = `mg-96${String(Math.floor(Math.random() * 1e5)).padStart(5, '0')}`;
  const ip = `198.51.100.${Math.floor(Math.random() * 250) + 1}`;
  const clerk = configured ? devClerk() : null;
  const created: string[] = [];
  let svc: SupabaseClient;
  let person: ClerkTestUser;
  let admin: ClerkTestUser;
  let activityId = '';
  let seq = 0;
  const turnstile = () => `XXXX.DUMMY.TOKEN.clerk.${tag}.${++seq}`;

  async function api(path: string, init: { method?: string; token?: string; json?: unknown } = {}) {
    const headers: Record<string, string> = { 'CF-Connecting-IP': ip };
    if (init.json !== undefined) headers['Content-Type'] = 'application/json';
    if (init.token) headers.Authorization = `Bearer ${init.token}`;
    const started = Date.now();
    const res = await fetch(`${WORKER}/api/v1${path}`, {
      method: init.method ?? 'GET',
      headers,
      body: init.json !== undefined ? JSON.stringify(init.json) : undefined,
    });
    const ms = Date.now() - started;
    const text = await res.text();
    let json: { data?: Record<string, unknown>; error?: { code: string } } = {};
    try {
      json = JSON.parse(text) as typeof json;
    } catch {
      /* non-JSON */
    }
    return { res, text, json, ms };
  }

  beforeAll(async () => {
    svc = createClient(URL_, SERVICE, opts);
    const t = await svc.from('territories').insert({
      id: muni,
      type: 'municipality',
      name: `Clerk ${tag}`,
      normalized_name: `clerk ${tag}`,
      parent_id: 'mg',
      ibge_code: muni.slice(3),
      slug: tag,
      municipality_name: `Clerk ${tag}`,
      centroid_lon: -43.9,
      centroid_lat: -19.9,
      data_quality: 'demo',
    });
    if (t.error) throw new Error(`territory: ${t.error.code}`);
    person = await createClerkTestUser(clerk!, `qa-clerk-${ts}@example.org`);
    created.push(person.id);
    admin = await createClerkTestUser(clerk!, `qa-clerk-admin-${ts}@example.org`);
    created.push(admin.id);
    const g = await svc.rpc('svc_grant_admin', { p_user: admin.id });
    if (g.error) throw new Error(`grant admin: ${g.error.code}`);
  });

  afterAll(async () => {
    if (!svc) return;
    await svc.from('territories').delete().eq('id', muni); // activities/RSVPs cascade
    for (const id of created) await deleteClerkTestUser(clerk!, svc, id);
  });

  it('Clerk ids and tokens are real (user_…, RS256 JWT with sub = user id, no e-mail claims)', async () => {
    expect(person.id).toMatch(/^user_[A-Za-z0-9]+$/);
    const jwt = await person.token();
    const [h, p] = jwt.split('.');
    const header = JSON.parse(Buffer.from(h!, 'base64url').toString()) as { alg: string };
    const claims = JSON.parse(Buffer.from(p!, 'base64url').toString()) as Record<string, unknown>;
    expect(header.alg).toBe('RS256');
    expect(claims.sub).toBe(person.id);
    expect(claims.sts).toBe('active');
    expect(Number(claims.exp) - Number(claims.iat)).toBeLessThanOrEqual(60);
    expect(claims.email).toBeUndefined(); // default session token: resolved via Backend API
  });

  it('no token -> 401; forged token -> 401; tampered real token -> 401', async () => {
    expect((await api('/me')).res.status).toBe(401);
    const jwt = await person.token();
    const [h, p, s] = jwt.split('.');
    const tampered = `${h}.${p}.${s!.slice(0, -4)}AAAA`;
    expect((await api('/me', { token: tampered })).res.status).toBe(401);
    const forgedClaims = Buffer.from(JSON.stringify({ sub: admin.id })).toString('base64url');
    expect((await api('/me', { token: `${h}.${forgedClaims}.${s}` })).res.status).toBe(401);
  });

  it('before registration: /me works (no profile), organizer routes refuse (403)', async () => {
    const me = await api('/me', { token: await person.token() });
    expect(me.res.status).toBe(200);
    expect(me.json.data).toMatchObject({
      user_id: person.id,
      email_verified: true,
      is_anonymous: false,
      display_name: null,
      is_admin: false,
    });
    const act = await api('/activities', { method: 'POST', token: await person.token(), json: {} });
    expect(act.res.status).toBe(403);
    console.log(`CLERK_LIVE_me_ms=${me.ms}`);
  });

  it('registration with the verified Clerk e-mail -> 201 verified; re-send -> 200', async () => {
    const body = {
      display_name: 'Pessoa Clerk QA',
      email: person.email,
      phone: '(31) 98888-1234',
      territory_id: muni,
      terms_accepted: true,
      contact_opt_in: false,
      consent_version: '2026-10',
      turnstile_token: turnstile(),
    };
    const reg = await api('/registrations', {
      method: 'POST',
      token: await person.token(),
      json: body,
    });
    expect(reg.res.status).toBe(201);
    expect(reg.json.data).toEqual({
      profile_id: person.id,
      territory_id: muni,
      email_verification_state: 'verified',
      session_state: 'verified',
    });
    const again = await api('/registrations', {
      method: 'POST',
      token: await person.token(),
      json: { ...body, turnstile_token: turnstile() },
    });
    expect(again.res.status).toBe(200);
    const profile = await svc.rpc('svc_get_profile', { p_user: person.id });
    expect((profile.data as { email_contact: string }).email_contact).toBe(person.email);
    expect((profile.data as { review_required_at: string | null }).review_required_at).toBeNull();
  });

  it('/me after registration: verified, masked, no review flag', async () => {
    const me = await api('/me', { token: await person.token() });
    expect(me.res.status).toBe(200);
    expect(me.json.data).toMatchObject({
      user_id: person.id,
      display_name: 'Pessoa Clerk QA',
      email_verified: true,
      is_anonymous: false,
      is_admin: false,
      profile_review_required: false,
      selected_territory_id: muni,
    });
    expect(me.text).not.toContain(person.email);
    expect(me.text).not.toContain('988881234');
  });

  it('organizer creates an activity (pending_review); admin by Clerk id approves it', async () => {
    const act = await api('/activities', {
      method: 'POST',
      token: await person.token(),
      json: {
        title: 'Encontro Clerk QA',
        type: 'encontro',
        description: 'Atividade criada pelo teste ao vivo com sessão do Clerk.',
        territory_id: muni,
        public_address: 'Praça Clerk QA, 1',
        coordinates: [-43.9, -19.9],
        location_confirmed: true,
        starts_at: new Date(Date.now() + 4 * 86_400_000).toISOString(),
        timezone: 'America/Sao_Paulo',
        public_contact_opt_in: false,
      },
    });
    expect(act.res.status).toBe(201);
    expect(act.json.data?.status).toBe('pending_review');
    activityId = String(act.json.data?.id);
    const row = await svc
      .from('activities')
      .select('creator_user_id')
      .eq('id', activityId)
      .single();
    expect(row.data?.creator_user_id).toBe(person.id);

    const denied = await api(`/admin/activities/${activityId}/approve`, {
      method: 'POST',
      token: await person.token(),
    });
    expect(denied.res.status).toBe(403);
    const adminMe = await api('/me', { token: await admin.token() });
    expect(adminMe.json.data?.is_admin).toBe(true);
    const ok = await api(`/admin/activities/${activityId}/approve`, {
      method: 'POST',
      token: await admin.token(),
    });
    expect(ok.res.status).toBe(200);
    const pub = await api(`/activities/${activityId}`);
    expect(pub.res.status).toBe(200);
    expect(pub.text).not.toContain(person.id);
  });

  it('RSVP with the Clerk session is idempotent per user; cancel works; count is aggregate', async () => {
    const tok = await person.token();
    const r1 = await api(`/activities/${activityId}/rsvp`, { method: 'POST', token: tok });
    expect(r1.res.status).toBe(200);
    expect(r1.json.data?.rsvp_count_approx).toBe(1);
    expect(r1.res.headers.get('set-cookie')).toBeNull(); // session identity: no device cookie
    const r2 = await api(`/activities/${activityId}/rsvp`, { method: 'POST', token: tok });
    expect(r2.json.data?.rsvp_count_approx).toBe(1);
    const other = await api(`/activities/${activityId}/rsvp`, {
      method: 'POST',
      token: await admin.token(),
    });
    expect(other.json.data?.rsvp_count_approx).toBe(2);
    const del = await api(`/activities/${activityId}/rsvp`, { method: 'DELETE', token: tok });
    expect(del.res.status).toBe(200);
    expect(del.json.data?.rsvp_count_approx).toBe(1);
    expect(del.text).not.toContain(person.id);
  });

  it('erasure by Clerk id removes the person’s rows (RSVP stored under the Clerk id)', async () => {
    const r = await svc.rpc('svc_erase_user_data', {
      p_user: person.id,
      p_request_id: `clerk-live-${tag}`,
    });
    expect(r.error).toBeNull();
    expect(r.data).toMatchObject({ rsvps: 1, activities: 1, profiles: 1, admins: 0 });
    const me = await api('/me', { token: await person.token() });
    expect(me.json.data?.display_name).toBeNull();
  });
});
