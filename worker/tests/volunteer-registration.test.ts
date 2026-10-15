import { describe, expect, it } from 'vitest';
import { RegistrationResult } from '../../shared/contracts/registration.ts';
import { RATE_LIMITS } from '../middleware/rate-limit.ts';
import { body, setup } from './fakes.ts';

/** D48: POST /registrations is the volunteer sign-up WITHOUT an account (public). */
const URL_ = '/api/v1/registrations';

let seq = 0;
const input = (over: Record<string, unknown> = {}) => ({
  display_name: 'Maria Voluntária',
  email: `maria${++seq}@example.org`,
  phone: '(31) 99999-8888',
  territory_id: 'mg-3140001-centro',
  terms_accepted: true,
  contact_opt_in: true,
  consent_version: 'v1',
  turnstile_token: `tok-${seq}-${Math.random()}`,
  ...over,
});

describe('POST /registrations — volunteer without an account (D48)', () => {
  it('no session needed: 200 {territory_id, status:"received"}, no-store, stored once, audited without PII', async () => {
    const { request, repo, turnstile } = setup();
    const res = await request(URL_, {
      method: 'POST',
      json: input({ email: 'Maria.Silva@Example.org', display_name: '  Maria <b>Silva</b> ' }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    const json = await body(res);
    expect(json.data).toEqual({ territory_id: 'mg-3140001-centro', status: 'received' });
    expect(RegistrationResult.safeParse(json.data).success).toBe(true);
    expect(json.meta?.request_id).toBeTruthy();
    expect(turnstile.calls).toBe(1);

    const row = repo.volunteers.get('maria.silva@example.org');
    expect(row).toMatchObject({
      email: 'maria.silva@example.org',
      phone_e164: '+5531999998888',
      territory_id: 'mg-3140001-centro',
      consent_version: 'v1',
    });
    expect(row?.display_name).not.toMatch(/[<>]/);
    expect(row?.contact_opt_in_at).not.toBeNull();
    // no Clerk account, no profile
    expect(repo.profiles.size).toBe(0);

    const audit = repo.audit.filter((a) => a.action === 'volunteer.signup');
    expect(audit).toEqual([
      { actor: null, action: 'volunteer.signup', entity_id: null, reason: 'outcome=created' },
    ]);
    expect(JSON.stringify(repo.audit)).not.toMatch(/maria|@example|\+55|9999/i);
  });

  it('the answer never carries ids or personal data', async () => {
    const { request } = setup();
    const text = await (
      await request(URL_, { method: 'POST', json: input({ email: 'pii@example.org' }) })
    ).text();
    expect(text).not.toMatch(/pii@|example\.org|\+55|99999|Maria|user_|profile_id|"id"/);
  });

  it('repeated e-mail -> EXACTLY the same answer, the stored row is not overwritten', async () => {
    const { request, repo } = setup();
    const first = await request(URL_, {
      method: 'POST',
      json: input({ email: 'dup@example.org', display_name: 'Primeira Pessoa' }),
    });
    const again = await request(URL_, {
      method: 'POST',
      json: input({
        email: 'DUP@example.org',
        display_name: 'Outra Pessoa',
        phone: '(31) 98888-7777',
        territory_id: 'mg-3106200',
        contact_opt_in: false,
      }),
    });
    expect(again.status).toBe(first.status);
    const a = (await body(first)).data;
    const b = (await body(again)).data;
    expect(Object.keys(b as object).sort()).toEqual(Object.keys(a as object).sort());
    expect(b).toEqual({ territory_id: 'mg-3106200', status: 'received' });
    expect(repo.volunteers.size).toBe(1);
    expect(repo.volunteers.get('dup@example.org')).toMatchObject({
      display_name: 'Primeira Pessoa',
      phone_e164: '+5531999998888',
      territory_id: 'mg-3140001-centro',
    });
    expect(repo.audit.map((x) => x.reason)).toEqual(['outcome=created', 'outcome=duplicate']);
  });

  it('a Bearer token is ignored (even an invalid one): no 401, no profile', async () => {
    const { request, repo, users } = setup();
    const invalid = await request(URL_, {
      method: 'POST',
      token: 'not-a-valid-clerk-session-token',
      json: input(),
    });
    expect(invalid.status).toBe(200);
    const s = users.signedUp('conta@example.org');
    const withSession = await request(URL_, {
      method: 'POST',
      token: s.token,
      json: input({ email: 'conta@example.org' }),
    });
    expect(withSession.status).toBe(200);
    expect(repo.profiles.size).toBe(0);
    expect(repo.volunteers.size).toBe(2);
  });

  it('Turnstile missing -> 400 field error; invalid -> TURNSTILE_FAILED; nothing stored', async () => {
    const { request, repo } = setup();
    const { turnstile_token: _omit, ...noToken } = input();
    const missing = await request(URL_, { method: 'POST', json: noToken });
    expect(missing.status).toBe(400);
    expect((await body(missing)).error?.fields?.turnstile_token).toBeDefined();
    const invalid = await request(URL_, {
      method: 'POST',
      json: input({ turnstile_token: 'bad-token' }),
    });
    expect(invalid.status).toBe(400);
    expect((await body(invalid)).error?.code).toBe('TURNSTILE_FAILED');
    expect(repo.volunteers.size).toBe(0);
  });

  it('Turnstile is single use: replaying the same token is refused', async () => {
    const { request, repo } = setup();
    const token = 'tok-single-use-1234567890';
    expect(
      (await request(URL_, { method: 'POST', json: input({ turnstile_token: token }) })).status,
    ).toBe(200);
    const replay = await request(URL_, { method: 'POST', json: input({ turnstile_token: token }) });
    expect((await body(replay)).error?.code).toBe('TURNSTILE_FAILED');
    expect(repo.volunteers.size).toBe(1);
  });

  it('Turnstile with a different action is refused', async () => {
    const { request, repo } = setup();
    const res = await request(URL_, {
      method: 'POST',
      json: input({ turnstile_token: 'tok-no-action-123456' }),
    });
    expect((await body(res)).error?.code).toBe('TURNSTILE_FAILED');
    expect(repo.volunteers.size).toBe(0);
  });

  it('unknown territory -> 400 with field error, nothing stored', async () => {
    const { request, repo } = setup();
    const res = await request(URL_, {
      method: 'POST',
      json: input({ territory_id: 'mg-9999999' }),
    });
    expect(res.status).toBe(400);
    const json = await body(res);
    expect(json.error?.code).toBe('VALIDATION_ERROR');
    expect(json.error?.fields?.territory_id).toBeDefined();
    expect(repo.volunteers.size).toBe(0);
  });

  it('invalid fields (e-mail, phone, terms) -> 400 with field errors, Turnstile not spent', async () => {
    const { request, repo, turnstile } = setup();
    const res = await request(URL_, {
      method: 'POST',
      json: input({ email: 'nope', phone: '123', terms_accepted: false }),
    });
    expect(res.status).toBe(400);
    const fields = (await body(res)).error?.fields ?? {};
    expect(Object.keys(fields)).toEqual(
      expect.arrayContaining(['email', 'phone', 'terms_accepted']),
    );
    expect(repo.volunteers.size).toBe(0);
    expect(turnstile.calls).toBe(0);
  });

  it('repository failure -> 500 generic, no SQL/stack, no PII', async () => {
    const { request, repo } = setup();
    repo.createVolunteerSignup = () => Promise.reject(new Error('duplicate key value violates'));
    const res = await request(URL_, { method: 'POST', json: input({ email: 'x1@example.org' }) });
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).not.toMatch(/duplicate|violates|x1@|stack/);
  });

  it('rate limit per IP (volunteer_ip) -> 429 + Retry-After; other IPs unaffected', async () => {
    const { request } = setup();
    const headers = { 'CF-Connecting-IP': '203.0.113.9' };
    const limit = RATE_LIMITS.volunteer_ip.limit;
    for (let i = 0; i < limit; i++) {
      expect((await request(URL_, { method: 'POST', headers, json: input() })).status).toBe(200);
    }
    const blocked = await request(URL_, { method: 'POST', headers, json: input() });
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('Retry-After')).toMatch(/^\d+$/);
    expect((await body(blocked)).error?.code).toBe('RATE_LIMITED');
    const other = await request(URL_, {
      method: 'POST',
      headers: { 'CF-Connecting-IP': '203.0.113.10' },
      json: input(),
    });
    expect(other.status).toBe(200);
  });
});
