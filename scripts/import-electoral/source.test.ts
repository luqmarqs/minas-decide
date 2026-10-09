import { describe, expect, it } from 'vitest';
import { assertDbUrl, assertReadOnlySql, maskSecrets, wrapReadOnly } from './source.ts';
import { q, scopeWhere } from './sql.ts';

describe('assertReadOnlySql', () => {
  it('accepts SELECT and WITH', () => {
    expect(() => assertReadOnlySql('SELECT 1')).not.toThrow();
    expect(() => assertReadOnlySql('  with a as (select 1) select * from a ')).not.toThrow();
  });
  it.each([
    'INSERT INTO t VALUES (1)',
    'UPDATE t SET a=1',
    'DELETE FROM t',
    'DROP TABLE t',
    'CREATE TABLE t(a int)',
    'TRUNCATE t',
    'COPY t TO STDOUT',
    'GRANT ALL ON t TO x',
    'CALL p()',
    'DO $$ BEGIN END $$',
    'SELECT 1; SELECT 2',
    'SELECT 1; DROP TABLE t',
    'SELECT * INTO newt FROM t',
    "SELECT set_config('transaction_read_only','off',true)",
    'SELECT pg_sleep(100)',
    'SELECT 1 -- ; DROP',
    'SELECT 1 /* x */',
    'WITH x AS (DELETE FROM t RETURNING 1) SELECT * FROM x',
    'BEGIN',
    'COMMIT',
    'SET statement_timeout=0',
    'EXPLAIN ANALYZE SELECT 1',
    '',
  ])('refuses %j', (sql) => {
    expect(() => assertReadOnlySql(sql)).toThrow();
  });
  it('accepts every statement the ETL templates generate', () => {
    const where = scopeWhere({ uf: 'MG', ibge: '3140001' });
    const all = [
      q.probe(),
      q.health(),
      q.municipalities('MG'),
      q.municipalityByIbge('3140001'),
      q.locais(where),
      q.totais(where, 1),
      q.candidaturas('MG'),
      q.candidaturas('MG', [6257, 6259]),
      q.candidateIds('MG', 6, [6259]),
      q.votes([1, 2, 3], where),
      q.historico(where),
    ];
    for (const s of all) expect(() => assertReadOnlySql(s)).not.toThrow();
  });
});

describe('election filter in SQL', () => {
  it('adds cd_eleicao IN only when codes are given', () => {
    expect(q.candidaturas('MG')).not.toContain('cd_eleicao IN');
    expect(q.candidaturas('MG', [6257, 6259])).toContain('AND cd_eleicao IN (6257,6259)');
    expect(q.candidateIds('MG', 1, [6257])).toContain('AND cd_eleicao IN (6257)');
  });
  it('rejects non-integer codes', () => {
    expect(() => q.candidaturas('MG', [1.5])).toThrow();
    expect(() => q.candidaturas('MG', [-1])).toThrow();
  });
});

describe('wrapReadOnly', () => {
  it('wraps in BEGIN READ ONLY with timeouts', () => {
    const w = wrapReadOnly('SELECT 1', '5s');
    expect(w.startsWith('BEGIN READ ONLY;')).toBe(true);
    expect(w).toContain("statement_timeout = '5s'");
    expect(w.trimEnd().endsWith('COMMIT;')).toBe(true);
  });
  it('refuses unsafe timeouts and SQL', () => {
    expect(() => wrapReadOnly('SELECT 1', "5s'; DROP")).toThrow();
    expect(() => wrapReadOnly('DROP TABLE t')).toThrow();
  });
});

describe('db-url handling (no secrets leaked)', () => {
  const url = 'postgresql://ro_user:S3cr3t!pw@db.abcdefghijklmnopqrst.supabase.co:5432/postgres';
  it('validates URL shape without echoing it', () => {
    expect(() => assertDbUrl(url)).not.toThrow();
    expect(() => assertDbUrl('mysql://x')).toThrow(/postgres/);
    expect(() => assertDbUrl('not a url')).toThrow(/not a valid URL/);
  });
  it('masks password, host and whole url in messages', () => {
    const msg = `connect ECONNREFUSED ${url} (host db.abcdefghijklmnopqrst.supabase.co, password S3cr3t!pw)`;
    const out = maskSecrets(msg, url);
    expect(out).not.toContain('S3cr3t');
    expect(out).not.toContain('abcdefghijklmnopqrst');
    expect(out).not.toContain('ro_user');
  });
  it('masks supabase refs even without a url', () => {
    expect(maskSecrets('x abcdefghijklmnopqrst.supabase.co y')).toBe('x <ref>.supabase.co y');
  });
});
