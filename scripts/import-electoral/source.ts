/**
 * Read-only access to the legacy electoral Supabase (SOURCE).
 *
 * Credentials never touch this code: queries are executed through the
 * operator's authenticated Supabase CLI session, linked in an ISOLATED workdir
 * outside the repository (ELECTORAL_SOURCE_WORKDIR). Alternatively a SELECT-only
 * connection string can be passed via ELECTORAL_SOURCE_DATABASE_URL (shell only).
 *
 * Every statement runs inside `BEGIN READ ONLY` with statement/lock timeouts.
 * Anything that is not SELECT/WITH is refused before reaching the network.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

export interface SourceConnection {
  mode: 'cli-workdir' | 'db-url';
  workdir?: string;
  dbUrl?: string;
  alias: string;
}

export interface QueryResult<T = Record<string, unknown>> {
  rows: T[];
  ms: number;
  bytes: number;
}

const FORBIDDEN =
  /\b(INSERT|UPDATE|DELETE|MERGE|TRUNCATE|DROP|ALTER|CREATE|GRANT|REVOKE|VACUUM|ANALYZE|REINDEX|CLUSTER|COPY|LOCK|REFRESH|CALL|DO)\b/i;

export function resolveSource(): SourceConnection {
  const dbUrl = process.env.ELECTORAL_SOURCE_DATABASE_URL;
  if (dbUrl) return { mode: 'db-url', dbUrl, alias: 'electoral-source-readonly' };
  const workdir = resolve(
    process.env.ELECTORAL_SOURCE_WORKDIR ?? join(homedir(), '.minas-em-movimento', 'source-readonly'),
  );
  if (!existsSync(join(workdir, 'supabase', '.temp', 'project-ref'))) {
    throw new Error(
      `SOURCE workdir not linked: ${workdir}. Link the SOURCE project there (outside the repo) with the Supabase CLI, or set ELECTORAL_SOURCE_DATABASE_URL.`,
    );
  }
  if (workdir === process.cwd() || workdir.startsWith(process.cwd() + '\\') || workdir.startsWith(process.cwd() + '/')) {
    throw new Error('SOURCE workdir must be outside the repository.');
  }
  return { mode: 'cli-workdir', workdir, alias: 'electoral-source-readonly' };
}

/** Ensures the SOURCE link is not the repository's (TARGET) link. */
export function assertNotTarget(conn: SourceConnection): void {
  if (conn.mode !== 'cli-workdir' || !conn.workdir) return;
  const sourceRef = readFileSync(join(conn.workdir, 'supabase', '.temp', 'project-ref'), 'utf8').trim();
  const repoRefFile = resolve(process.cwd(), 'supabase', '.temp', 'project-ref');
  if (existsSync(repoRefFile)) {
    const targetRef = readFileSync(repoRefFile, 'utf8').trim();
    if (targetRef === sourceRef) {
      throw new Error('Refusing: SOURCE workdir is linked to the same project as the repository (TARGET).');
    }
  }
  const expectedFile = join(homedir(), '.minas-em-movimento', 'source.ref');
  if (existsSync(expectedFile)) {
    const expected = readFileSync(expectedFile, 'utf8').trim();
    if (expected !== sourceRef) {
      throw new Error('Refusing: SOURCE workdir is linked to a project different from the confirmed SOURCE ref.');
    }
  }
}

export function assertReadOnlySql(sql: string): void {
  const trimmed = sql.trim();
  if (!/^(SELECT|WITH)\b/i.test(trimmed)) throw new Error('Only SELECT/WITH statements are allowed against SOURCE.');
  if (FORBIDDEN.test(trimmed)) throw new Error('Forbidden keyword in SOURCE query.');
  if (trimmed.includes(';')) throw new Error('Multiple statements are not allowed.');
}

export function runQuery<T = Record<string, unknown>>(
  conn: SourceConnection,
  sql: string,
  opts: { statementTimeout?: string } = {},
): QueryResult<T> {
  assertReadOnlySql(sql);
  const wrapped = `BEGIN READ ONLY;\nSET LOCAL statement_timeout = '${opts.statementTimeout ?? '45s'}';\nSET LOCAL lock_timeout = '1s';\n${sql.trim()};\nCOMMIT;`;
  const dir = mkdtempSync(join(tmpdir(), 'mm-etl-'));
  const file = join(dir, 'q.sql');
  writeFileSync(file, wrapped, 'utf8');
  const args = ['db', 'query', '--agent=no', '-o', 'json', '-f', file];
  if (conn.mode === 'db-url') args.push('--db-url', conn.dbUrl!);
  else args.push('--linked', '--workdir', conn.workdir!);
  const t0 = performance.now();
  let out: string;
  try {
    out = execFileSync('supabase', args, {
      encoding: 'utf8',
      maxBuffer: 512 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    const e = err as { stderr?: string; stdout?: string; message: string };
    const msg = (e.stderr ?? e.message).replace(/[a-z]{20}\.supabase\.co/g, '<ref>.supabase.co');
    throw new Error(`SOURCE query failed: ${msg.slice(0, 600)}`, { cause: err });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  const ms = Math.round(performance.now() - t0);
  const start = out.indexOf('[');
  if (start < 0) return { rows: [], ms, bytes: out.length };
  const rows = JSON.parse(out.slice(start)) as T[];
  return { rows, ms, bytes: out.length - start };
}
