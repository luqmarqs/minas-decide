/**
 * QA-2 (qa-security, independent) — adversarial checks on round-2 changes.
 *   - `it(...)`       = control verified OK (regression).
 *   - `it.fails(...)` = FINDING: the assertion encodes the SECURE expectation and fails today.
 *     When the finding is fixed the test starts passing and vitest reports it -> flip to `it`.
 * BE-3 (2026-10-09): QA2-01, 01b, 02, 03, 04, 04b, 05 fixed and flipped to `it`; 01b now
 * asserts the secure outcome. QA2-06 belongs to the extractor (other agent).
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { body, setup } from './fakes.ts';

// The extractor guard is Node code (node:fs, node:child_process). A literal import would pull
// it into the Worker type program (tsconfig.worker.json has no Node types) and break
// `npm run typecheck`; a non-literal dynamic import keeps it out of tsc and works in vitest.
type SqlGuard = (sql: string) => void;
const SOURCE_GUARD_MODULE = '../../scripts/import-electoral/source.ts';
let assertReadOnlySql: SqlGuard = () => {
  throw new Error('guard not loaded');
};
beforeAll(async () => {
  const mod = (await import(/* @vite-ignore */ SOURCE_GUARD_MODULE)) as {
    assertReadOnlySql: SqlGuard;
  };
  assertReadOnlySql = mod.assertReadOnlySql;
});

const registration = (over: Record<string, unknown> = {}) => ({
  display_name: 'Nome do Atacante',
  email: 'vitima@example.org',
  phone: '(31) 98888-7777',
  territory_id: 'mg-3140001-centro',
  terms_accepted: true,
  contact_opt_in: true,
  consent_version: '2026-10',
  turnstile_token: `tok-${Math.random()}`,
  ...over,
});

const proposal = (over: Record<string, unknown> = {}) => ({
  territory_id: 'mg-3140001',
  name_proposed: 'Grupo Mariana Centro',
  join_url_proposed: 'https://chat.whatsapp.com/AbCdEfGhIjKlMn',
  proposer_name: 'Proponente',
  proposer_email: 'proponente@example.org',
  proposer_phone: '(31) 97777-1234',
  responsibility_accepted: true,
  consent_version: '2026-10',
  turnstile_token: `tok-${Math.random()}`,
  ...over,
});

const future = (days: number) =>
  new Date(Date.parse('2026-10-08T12:00:00Z') + days * 86_400_000).toISOString();
const activityInput = () => ({
  title: 'Panfletagem na praça',
  type: 'panfletagem',
  description: 'Vamos distribuir material na praça central.',
  territory_id: 'mg-3140001-centro',
  public_address: 'Praça Gomes Freire, Mariana',
  coordinates: [-43.41, -20.38],
  location_confirmed: true,
  starts_at: future(3),
  ends_at: future(3.1),
  timezone: 'America/Sao_Paulo',
  public_contact_opt_in: false,
});

/** Provisional profile registered with the victim's e-mail, then made permanent by GoTrue
 *  itself (email_change verified) BEFORE the Worker's /auth/confirm-email runs. */
async function promotedOutsideWorker() {
  const s = setup();
  const a = s.users.anonymous();
  const reg = await s.request('/api/v1/registrations', {
    method: 'POST',
    token: a.token,
    json: registration(),
  });
  expect(reg.status).toBe(201);
  a.user.email = 'vitima@example.org';
  a.user.email_confirmed = true;
  a.user.is_anonymous = false;
  a.user.jwt_is_anonymous = false;
  a.user.amr_methods = ['otp'];
  s.repo.verified.add(a.user.id);
  const conf = await s.request('/api/v1/auth/confirm-email', { method: 'POST', token: a.token });
  expect(conf.status).toBe(200);
  return { s, a, conf };
}

describe('QA-2 P-SEC-1', () => {
  it('QA2-01: promotion done outside the Worker must still flag review and revoke other sessions', async () => {
    const { s, conf } = await promotedOutsideWorker();
    expect((await body(conf)).data?.profile_review_required).toBe(true);
    expect(s.auth.signedOutOthers.length).toBe(1);
  });

  it('QA2-01b (impact, fixed): in that path the account can no longer organize before review', async () => {
    const { s, a } = await promotedOutsideWorker();
    const act = await s.request('/api/v1/activities', {
      method: 'POST',
      token: a.token,
      json: activityInput(),
    });
    expect(act.status).toBe(403);
    expect(s.auth.signedOutOthers).toHaveLength(1);
    expect(s.repo.activities).toHaveLength(0);
  });

  it('QA2-02: confirm-email must fail closed when revoking other sessions fails', async () => {
    const s = setup();
    const a = s.users.anonymous();
    await s.request('/api/v1/registrations', {
      method: 'POST',
      token: a.token,
      json: registration(),
    });
    s.auth.signOutOthers = async () => false; // GoTrue error / timeout
    a.user.email = 'vitima@example.org';
    a.user.email_confirmed = true;
    a.user.amr_methods = ['otp'];
    const conf = await s.request('/api/v1/auth/confirm-email', {
      method: 'POST',
      token: a.token,
    });
    expect(conf.status).not.toBe(200);
  });

  it('control: PATCH /me only edits the caller (anon attacker without profile -> 404)', async () => {
    const s = setup();
    const victim = s.users.verified();
    await s.repo.updateProfile(victim.user.id, { review_required: true });
    const attacker = s.users.anonymous();
    const r = await s.request('/api/v1/me', {
      method: 'PATCH',
      token: attacker.token,
      json: { profile_reviewed: true, phone: '(31) 95555-0000' },
    });
    expect(r.status).toBe(404);
    expect(s.repo.profiles.get(victim.user.id)?.review_required_at).not.toBeNull();
  });

  it('control: PATCH own activity and /my-activities are blocked while review is pending', async () => {
    const s = setup();
    const v = s.users.verified();
    const row = s.repo.seedActivity(v.user.id);
    await s.repo.updateProfile(v.user.id, { review_required: true });
    const p = await s.request(`/api/v1/activities/${row.id}`, {
      method: 'PATCH',
      token: v.token,
      json: { version: row.version, title: 'Novo título aqui' },
    });
    expect(p.status).toBe(403);
    expect((await s.request('/api/v1/my-activities', { token: v.token })).status).toBe(403);
  });
});

describe('QA-2 edge cache', () => {
  it('QA2-03: approving a group proposal must purge the cached /groups of its territory', async () => {
    const s = setup({ APP_ENV: 'local' }, { edgeCache: true });
    const url = '/api/v1/groups?territory_id=mg-3140001';
    expect((await body(await s.request(url))).data?.items).toHaveLength(0);
    const p = await body(
      await s.request('/api/v1/groups/proposals', { method: 'POST', json: proposal() }),
    );
    const ap = await s.request(`/api/v1/admin/groups/${String(p.data?.id)}/approve`, {
      method: 'POST',
      token: s.users.admin('aal2').token,
    });
    expect(ap.status).toBe(200);
    expect((await body(await s.request(url))).data?.items).toHaveLength(1);
  });

  it('QA2-04: suspended municipal group must not stay cached under a neighborhood fallback URL', async () => {
    const s = setup({}, { edgeCache: true });
    const g = s.repo.addGroup('mg-3140001');
    const hood = '/api/v1/groups?territory_id=mg-3140001-centro';
    const before = await body(await s.request(hood));
    expect(before.data?.fallback).toBe('municipality');
    expect(before.data?.items).toHaveLength(1);
    const sus = await s.request(`/api/v1/admin/groups/${g.id}/suspend`, {
      method: 'POST',
      token: s.users.admin('aal2').token,
      json: { reason: 'link de golpe' },
    });
    expect(sus.status).toBe(200);
    const after = await s.request(hood);
    expect((await body(after)).data?.items).toHaveLength(0);
  });

  it('QA2-04b: an extra query param keeps a suspended group cached after the purge', async () => {
    const s = setup({}, { edgeCache: true });
    const g = s.repo.addGroup('mg-3140001');
    const busted = '/api/v1/groups?territory_id=mg-3140001&x=1';
    expect((await body(await s.request(busted))).data?.items).toHaveLength(1);
    await s.request(`/api/v1/admin/groups/${g.id}/suspend`, {
      method: 'POST',
      token: s.users.admin('aal2').token,
      json: { reason: 'link de golpe' },
    });
    expect((await body(await s.request(busted))).data?.items).toHaveLength(0);
  });

  it('control: private routes never get X-Cache nor public Cache-Control', async () => {
    const s = setup({}, { edgeCache: true });
    const v = s.users.verified();
    const admin = s.users.admin('aal2').token;
    const cases: [string, string][] = [
      ['/api/v1/me', v.token],
      ['/api/v1/my-activities', v.token],
      ['/api/v1/admin/queue', admin],
      ['/api/v1/admin/security-events', admin],
    ];
    for (const [path, token] of cases) {
      for (let i = 0; i < 2; i++) {
        const r = await s.request(path, { token });
        expect(r.status).toBe(200);
        expect(r.headers.get('X-Cache')).toBeNull();
        expect(r.headers.get('Cache-Control')).toBe('no-store');
      }
    }
    const keys = [...(s.edgeCache?.store.keys() ?? [])];
    expect(keys.some((k) => /\/me|admin|my-/.test(k))).toBe(false);
  });
});

describe('QA-2 idempotency / origin / admin / RSVP', () => {
  it('QA2-05: an explicit idempotency_key must be scoped per submitter', async () => {
    const s = setup({ APP_ENV: 'local' });
    const k = 'shared-key-123456';
    const a = await s.request('/api/v1/groups/proposals', {
      method: 'POST',
      headers: { 'CF-Connecting-IP': '203.0.113.1' },
      json: proposal({ idempotency_key: k }),
    });
    expect(a.status).toBe(201);
    const b = await s.request('/api/v1/groups/proposals', {
      method: 'POST',
      headers: { 'CF-Connecting-IP': '203.0.113.99' },
      json: proposal({
        idempotency_key: k,
        territory_id: 'mg-3106200',
        proposer_email: 'outra@example.org',
        join_url_proposed: 'https://chat.whatsapp.com/ZzZzZzZzZzZzZz',
      }),
    });
    // today: 200 with A's proposal id; B's proposal (and its PII) is silently dropped
    expect(b.status).toBe(201);
  });

  it('control: Origin bypass attempts are refused', async () => {
    const s = setup({ PUBLIC_ORIGIN: 'https://minasemmovimento.org', ALLOWED_ORIGINS: '' });
    const path = '/api/v1/activities/00000000-0000-4000-8000-000000000001/rsvp';
    for (const origin of [
      'null',
      'https://minasemmovimento.org.evil.com',
      'https://evil-minasemmovimento.org',
      'https://sub.minasemmovimento.org',
      'http://minasemmovimento.org',
      'https://minasemmovimento.org:8443',
      'http://localhost:5173',
      'file://',
      'https://minasemmovimento.org@evil.com',
    ]) {
      const r = await s.request(path, { method: 'POST', headers: { Origin: origin } });
      expect([origin, r.status]).toEqual([origin, 403]);
    }
    for (const origin of ['https://minasemmovimento.org', 'https://MINASEMMOVIMENTO.org:443']) {
      const r = await s.request(path, { method: 'POST', headers: { Origin: origin } });
      expect([origin, r.status]).not.toEqual([origin, 403]);
    }
  });

  it('control: admin aal1 denied on every admin route in staging/production', async () => {
    for (const APP_ENV of ['staging', 'production']) {
      const s = setup({ APP_ENV, WRITES_ENABLED: 'true' });
      const t = s.users.admin('aal1').token;
      const id = '00000000-0000-4000-8000-000000000001';
      const routes: [string, string][] = [
        ['GET', '/api/v1/admin/queue'],
        ['GET', '/api/v1/admin/security-events'],
        ['POST', `/api/v1/admin/groups/${id}/approve`],
        ['POST', `/api/v1/admin/groups/${id}/suspend`],
        ['POST', `/api/v1/admin/activities/${id}/suspend`],
        ['PATCH', `/api/v1/admin/groups/${id}`],
        ['POST', `/api/v1/admin/group-proposals/${id}/reveal-contact`],
      ];
      for (const [m, p] of routes) {
        const init =
          m === 'GET'
            ? { method: m, token: t }
            : { method: m, token: t, json: { reason: 'motivo' } };
        const r = await s.request(p, init);
        expect([APP_ENV, p, r.status]).toEqual([APP_ENV, p, 403]);
      }
    }
  });

  it('control: admin PATCH cannot revive a suspended group (404)', async () => {
    const s = setup();
    const g = s.repo.addGroup('mg-3140001', 'suspended');
    const r = await s.request(`/api/v1/admin/groups/${g.id}`, {
      method: 'PATCH',
      token: s.users.admin('aal2').token,
      json: { status: 'active', reason: 'reativar' },
    });
    expect(r.status).toBe(404);
  });

  it('documented limit: no cookie -> new identity per request; only the per-IP ceiling applies', async () => {
    const s = setup();
    const row = s.repo.seedActivity(s.repo.uuid());
    let ok = 0;
    let last = 0;
    for (let i = 0; i < 125; i++) {
      const r = await s.request(`/api/v1/activities/${row.id}/rsvp`, { method: 'POST' });
      last = r.status;
      if (r.status === 200) ok++;
    }
    expect(ok).toBe(120);
    expect(last).toBe(429);
    const pub = await body(await s.request(`/api/v1/activities/${row.id}`));
    expect(pub.data?.rsvp_count_approx).toBe(120);
  });
});

describe('QA-2 extractor SQL guard (defence in depth; READ ONLY txn is the real guard)', () => {
  it('control: classic bypasses are refused', () => {
    // the real guard is loaded (the placeholder would throw for anything)
    expect(() => assertReadOnlySql('SELECT 1')).not.toThrow();
    for (const sql of [
      'WITH x AS (INSERT INTO t VALUES (1) RETURNING 1) SELECT * FROM x',
      'SELECT * INTO t2 FROM t',
      'SELECT 1; COPY t TO PROGRAM $$id$$',
      "SELECT set_config('transaction_read_only','off',false)",
      'SELECT 1 /* x */',
      'SELECT 1 -- x',
      'SELECT $$;$$',
      'select pg_catalog.set_config($$a$$,$$b$$,true)',
      "SELECT dblink_exec('dbname=postgres','DROP TABLE x')",
      "SELECT lo_import('/etc/passwd')",
    ])
      expect(() => assertReadOnlySql(sql), sql).toThrow();
  });

  it('QA2-06: denylist bypass via U&"" escapes and unlisted functions', () => {
    const bypasses = [
      // dblink_exec opens a NEW session that is not READ ONLY
      `SELECT * FROM U&"\\0064blink\\005fexec"('dbname=postgres', 'select 1')`,
      `SELECT U&"pg\\005fread\\005ffile"('postgresql.conf')`,
      `SELECT U&"lo\\005fimport"('/etc/hosts')`,
      `SELECT pg_ls_dir('.')`,
      `SELECT pg_read_binary_file('postgresql.conf')`,
      `SELECT pg_cancel_backend(123)`,
      `SELECT query_to_xml(concat('DEL','ETE FROM t'), true, false, '')`,
    ];
    const accepted = bypasses.filter((sql) => {
      try {
        assertReadOnlySql(sql);
        return true;
      } catch {
        return false;
      }
    });
    expect(accepted).toEqual([]);
  });
});
