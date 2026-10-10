import { afterEach, describe, expect, it, vi } from 'vitest';
import { RATE_LIMITS } from '../middleware/rate-limit.ts';
import { csvCell, formatBrasilia, formatPhoneBr } from '../services/registrations-csv.ts';
import type { ProfileRow } from '../repositories/types.ts';
import { body, setup } from './fakes.ts';

const LIST = '/api/v1/admin/registrations';
const EXPORT = '/api/v1/admin/registrations/export.csv';

type T = ReturnType<typeof setup>;

function profile(i: number, over: Partial<ProfileRow> = {}): ProfileRow {
  // two rows per timestamp: the user_id tie-break must keep pagination exact
  const at = new Date(Date.parse('2026-09-01T12:00:00Z') + Math.floor(i / 2) * 60_000);
  return {
    user_id: `user_seed${String(i).padStart(6, '0')}`,
    display_name: `Pessoa ${i}`,
    email_contact: `pessoa${i}@example.org`,
    email_verification_state: 'verified',
    phone_e164: '+5531999990000',
    selected_territory_id: i % 2 === 0 ? 'mg-3140001' : 'mg-3106200',
    consent_version: 'v1',
    contact_opt_in_at: i % 3 === 0 ? at.toISOString() : null,
    account_state: 'active',
    review_required_at: null,
    created_at: at.toISOString(),
    updated_at: at.toISOString(),
    ...over,
  };
}

function seed(t: T, n: number) {
  for (let i = 0; i < n; i++) {
    const p = profile(i);
    t.repo.profiles.set(p.user_id, p);
  }
}

const parseCsv = (text: string) =>
  text
    .replace(/^\uFEFF/, '')
    .split('\r\n')
    .filter(Boolean);

afterEach(() => vi.restoreAllMocks());

describe('GET /admin/registrations', () => {
  it('pages by keyset (50), no overlaps, covers every row, total on every page', async () => {
    const t = setup();
    const a = t.users.admin();
    seed(t, 120);
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const res: Response = await t.request(`${LIST}${cursor ? `?cursor=${cursor}` : ''}`, {
        token: a.token,
      });
      expect(res.status).toBe(200);
      expect(res.headers.get('Cache-Control')).toContain('no-store');
      const data = (await body(res)).data as {
        items: { user_id: string; email: string; phone: string }[];
        next_cursor: string | null;
        total: number;
      };
      expect(data.total).toBe(120);
      expect(data.items.length).toBeLessThanOrEqual(50);
      if (data.next_cursor) expect(data.items).toHaveLength(50);
      seen.push(...data.items.map((i) => i.user_id));
      cursor = data.next_cursor;
      pages++;
    } while (cursor);
    expect(pages).toBe(3);
    expect(new Set(seen).size).toBe(120);
    // newest first
    expect(seen[0]).toBe('user_seed000119');
  });

  it('returns the contract fields (PII, admin only)', async () => {
    const t = setup();
    const a = t.users.admin();
    seed(t, 1);
    const item = (
      (await body(await t.request(LIST, { token: a.token }))).data!.items as Record<
        string,
        unknown
      >[]
    )[0]!;
    expect(item).toMatchObject({
      user_id: 'user_seed000000',
      display_name: 'Pessoa 0',
      email: 'pessoa0@example.org',
      phone: '+5531999990000',
      territory_id: 'mg-3140001',
      territory_name: 'Mariana',
      contact_opt_in: true,
      email_verification_state: 'verified',
      account_state: 'active',
    });
  });

  it('filters by q (name, e-mail, territory) and reports the filtered total', async () => {
    const t = setup();
    const a = t.users.admin();
    seed(t, 30);
    const byName = (await body(await t.request(`${LIST}?q=Pessoa%2017`, { token: a.token }))).data!;
    expect(byName.total).toBe(1);
    const byTerritory = (await body(await t.request(`${LIST}?q=belo`, { token: a.token }))).data!;
    expect(byTerritory.total).toBe(15);
    const byEmail = (await body(await t.request(`${LIST}?q=PESSOA3@`, { token: a.token }))).data!;
    expect(byEmail.total).toBe(1);
    const none = (await body(await t.request(`${LIST}?q=zzzz`, { token: a.token }))).data!;
    expect(none).toMatchObject({ items: [], next_cursor: null, total: 0 });
  });

  it('validates cursor and limit', async () => {
    const t = setup();
    const a = t.users.admin();
    expect((await t.request(`${LIST}?cursor=@@@`, { token: a.token })).status).toBe(400);
    expect((await t.request(`${LIST}?limit=51`, { token: a.token })).status).toBe(400);
    expect((await t.request(`${LIST}?limit=10`, { token: a.token })).status).toBe(200);
  });

  it('audits each page without PII values', async () => {
    const t = setup();
    const a = t.users.admin();
    seed(t, 60);
    const first = (await body(await t.request(`${LIST}?q=Pessoa`, { token: a.token }))).data!;
    await t.request(`${LIST}?q=Pessoa&cursor=${String(first.next_cursor)}`, { token: a.token });
    const rows = t.repo.audit.filter((e) => e.action === 'admin.registrations.list');
    expect(rows).toEqual([
      {
        actor: a.user.id,
        action: 'admin.registrations.list',
        entity_id: null,
        reason: 'q=present;cursor=absent;limit=50',
      },
      {
        actor: a.user.id,
        action: 'admin.registrations.list',
        entity_id: null,
        reason: 'q=present;cursor=present;limit=50',
      },
    ]);
    expect(JSON.stringify(rows)).not.toMatch(/Pessoa|@example/);
  });

  it('non-admin 403 and anonymous 401; nothing read or audited', async () => {
    const t = setup();
    const u = t.users.verified();
    expect((await t.request(LIST, { token: u.token })).status).toBe(403);
    expect((await t.request(LIST)).status).toBe(401);
    expect((await t.request(EXPORT, { token: u.token })).status).toBe(403);
    expect(t.repo.listProfilesCalls).toEqual([]);
    expect(t.repo.audit.filter((e) => e.action.startsWith('admin.registrations'))).toEqual([]);
  });
});

describe('GET /admin/registrations/export.csv', () => {
  it('walks the whole base in keyset batches of 1000 (2500 rows -> 3 batches), complete CSV', async () => {
    const t = setup();
    const a = t.users.admin();
    seed(t, 2500);
    const res = await t.request(EXPORT, { token: a.token });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/csv; charset=utf-8');
    expect(res.headers.get('Cache-Control')).toContain('no-store');
    expect(res.headers.get('Content-Disposition')).toBe(
      'attachment; filename="cadastros-minas-decide-2026-10-08.csv"',
    );
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]); // UTF-8 BOM
    const lines = parseCsv(new TextDecoder().decode(bytes));
    expect(lines[0]).toBe(
      'Nome;E-mail;WhatsApp;Território;Aceita comunicações;E-mail verificado;Situação da conta;Versão do termo;Cadastrado em (Brasília)',
    );
    expect(lines).toHaveLength(2501);
    expect(new Set(lines.slice(1).map((l) => l.split(';')[1])).size).toBe(2500);
    // limits: 1000/1000/1000 (the last one returns 500 rows, ending the walk) — never offset
    expect(t.repo.listProfilesCalls.map((c) => c.limit)).toEqual([1000, 1000, 1000]);
    expect(t.repo.listProfilesCalls.map((c) => c.after !== null)).toEqual([false, true, true]);
    expect(lines[1]).toBe(
      `Pessoa 2499;pessoa2499@example.org;(31) 99999-0000;Belo Horizonte;sim;verificado;ativa;v1;${formatBrasilia(profile(2499).created_at)}`,
    );
    // audited with the row count, no PII
    const audit = t.repo.audit.filter((e) => e.action === 'admin.registrations.export');
    expect(audit).toEqual([
      {
        actor: a.user.id,
        action: 'admin.registrations.export',
        entity_id: null,
        reason: 'row_count=2500;q=absent',
      },
    ]);
  });

  it('exactly 1000 rows: one full batch plus an empty one, no duplicates', async () => {
    const t = setup();
    const a = t.users.admin();
    seed(t, 1000);
    const lines = parseCsv(await (await t.request(EXPORT, { token: a.token })).text());
    expect(lines).toHaveLength(1001);
    expect(t.repo.listProfilesCalls).toHaveLength(2);
  });

  it('respects q and still audits the row count', async () => {
    const t = setup();
    const a = t.users.admin();
    seed(t, 40);
    const lines = parseCsv(
      await (await t.request(`${EXPORT}?q=mariana`, { token: a.token })).text(),
    );
    expect(lines).toHaveLength(21);
    expect(t.repo.audit.at(-1)?.reason).toBe('row_count=20;q=present');
  });

  it('neutralises spreadsheet formulas and quotes separators, quotes and line breaks', async () => {
    const t = setup();
    const a = t.users.admin();
    const evil = [
      '=HYPERLINK("http://x")',
      '+cmd',
      '-2+3',
      '@SUM(A1)',
      '\tTAB',
      '\rCR',
      'Ana; "A" \n Silva',
    ];
    evil.forEach((name, i) => {
      const p = profile(i, { display_name: name });
      t.repo.profiles.set(p.user_id, p);
    });
    const text = new TextDecoder().decode(
      await (await t.request(EXPORT, { token: a.token })).arrayBuffer(),
    );
    expect(text).toContain('"\'=HYPERLINK(""http://x"")";');
    expect(text).toContain("'+cmd;");
    expect(text).toContain("'-2+3;");
    expect(text).toContain("'@SUM(A1);");
    expect(text).toContain("'\tTAB;");
    expect(text).toContain('"\'\rCR";');
    expect(text).toContain('"Ana; ""A"" \n Silva";');
    // no cell starts with an executable character
    for (const line of text
      .replace(/^\uFEFF/, '')
      .split('\r\n')
      .slice(1)) {
      if (!line || line.startsWith('"Ana')) continue;
      expect(line.split(';')[0]).not.toMatch(/^[=+\-@\t]/);
    }
  });

  it('a repository failure on the first batch is a normal 500 (no broken download)', async () => {
    const t = setup();
    const a = t.users.admin();
    seed(t, 5);
    t.repo.failListProfilesAt = 1;
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = await t.request(EXPORT, { token: a.token });
    expect(res.status).toBe(500);
    expect(res.headers.get('Content-Type')).not.toContain('text/csv');
  });

  it('a failure mid-stream errors the stream and logs without PII', async () => {
    const t = setup();
    const a = t.users.admin();
    seed(t, 2500);
    t.repo.failListProfilesAt = 2;
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = await t.request(EXPORT, { token: a.token });
    expect(res.status).toBe(200);
    await expect(res.arrayBuffer()).rejects.toThrow();
    const logged = err.mock.calls.map((c) => String(c[0])).join('\n');
    expect(logged).toContain('admin.registrations.export');
    expect(logged).toContain('"rows_sent":1000');
    expect(logged).not.toMatch(/Pessoa|@example|user_seed|db down/);
  });

  it('is rate limited by the admin_write bucket (30 per 10 min)', async () => {
    const t = setup();
    const a = t.users.admin();
    seed(t, 3);
    const limit = RATE_LIMITS.admin_write.limit;
    for (let i = 0; i < limit; i++) {
      const res = await t.request(EXPORT, { token: a.token });
      expect(res.status, `request ${i + 1}`).toBe(200);
      await res.arrayBuffer();
    }
    const blocked = await t.request(EXPORT, { token: a.token });
    expect(blocked.status).toBe(429);
    expect((await body(blocked)).error?.code).toBe('RATE_LIMITED');
    // the listing uses another bucket
    expect((await t.request(LIST, { token: a.token })).status).toBe(200);
  });
});

describe('csv helpers', () => {
  it('csvCell / formatPhoneBr / formatBrasilia', () => {
    expect(csvCell('=1+1')).toBe("'=1+1");
    expect(csvCell('normal')).toBe('normal');
    expect(csvCell(null)).toBe('');
    expect(formatPhoneBr('+5531999990000')).toBe('(31) 99999-0000');
    expect(formatPhoneBr(null)).toBe('');
    expect(formatBrasilia('2026-10-08T15:04:05Z')).toBe('08/10/2026 12:04:05');
    expect(formatBrasilia('2026-10-08T02:00:00Z')).toBe('07/10/2026 23:00:00');
  });
});
