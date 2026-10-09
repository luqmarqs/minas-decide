/**
 * Read-only access to the legacy electoral Supabase (SOURCE).
 *
 * Credentials never touch this code: queries are executed through the
 * operator's authenticated Supabase CLI session, linked in an ISOLATED workdir
 * outside the repository (ELECTORAL_SOURCE_WORKDIR). Alternatively a SELECT-only
 * connection string can be passed via ELECTORAL_SOURCE_DATABASE_URL (shell only).
 * In that `db-url` mode the URL is NEVER placed in a process argument list
 * (visible in process listings): it is used in-process by the `postgres` driver
 * inside `BEGIN READ ONLY` (QA-1 F17).
 *
 * Every statement runs inside `BEGIN READ ONLY` with statement/lock timeouts.
 * Anything that is not SELECT/WITH is refused before reaching the network.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import postgres from 'postgres';
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
  /\b(INSERT|UPDATE|DELETE|MERGE|TRUNCATE|DROP|ALTER|CREATE|GRANT|REVOKE|VACUUM|ANALYZE|REINDEX|CLUSTER|COPY|LOCK|REFRESH|CALL|DO|INTO|SET_CONFIG|PG_SLEEP|DBLINK\w*|PG_READ_FILE|PG_TERMINATE_BACKEND|LO_\w+)\b/i;

export function resolveSource(): SourceConnection {
  const dbUrl = process.env.ELECTORAL_SOURCE_DATABASE_URL;
  if (dbUrl) return { mode: 'db-url', dbUrl, alias: 'electoral-source-readonly' };
  const workdir = resolve(
    process.env.ELECTORAL_SOURCE_WORKDIR ??
      join(homedir(), '.minas-em-movimento', 'source-readonly'),
  );
  if (!existsSync(join(workdir, 'supabase', '.temp', 'project-ref'))) {
    throw new Error(
      `SOURCE workdir not linked: ${workdir}. Link the SOURCE project there (outside the repo) with the Supabase CLI, or set ELECTORAL_SOURCE_DATABASE_URL.`,
    );
  }
  if (
    workdir === process.cwd() ||
    workdir.startsWith(process.cwd() + '\\') ||
    workdir.startsWith(process.cwd() + '/')
  ) {
    throw new Error('SOURCE workdir must be outside the repository.');
  }
  return { mode: 'cli-workdir', workdir, alias: 'electoral-source-readonly' };
}

/** Ensures the SOURCE link is not the repository's (TARGET) link. */
export function assertNotTarget(conn: SourceConnection): void {
  if (conn.mode !== 'cli-workdir' || !conn.workdir) return;
  const sourceRef = readFileSync(
    join(conn.workdir, 'supabase', '.temp', 'project-ref'),
    'utf8',
  ).trim();
  const repoRefFile = resolve(process.cwd(), 'supabase', '.temp', 'project-ref');
  if (existsSync(repoRefFile)) {
    const targetRef = readFileSync(repoRefFile, 'utf8').trim();
    if (targetRef === sourceRef) {
      throw new Error(
        'Refusing: SOURCE workdir is linked to the same project as the repository (TARGET).',
      );
    }
  }
  const expectedFile = join(homedir(), '.minas-em-movimento', 'source.ref');
  if (existsSync(expectedFile)) {
    const expected = readFileSync(expectedFile, 'utf8').trim();
    if (expected !== sourceRef) {
      throw new Error(
        'Refusing: SOURCE workdir is linked to a project different from the confirmed SOURCE ref.',
      );
    }
  }
}

export function assertReadOnlySql(sql: string): void {
  const trimmed = sql.trim();
  if (!/^(SELECT|WITH)\b/i.test(trimmed))
    throw new Error('Only SELECT/WITH statements are allowed against SOURCE.');
  if (FORBIDDEN.test(trimmed)) throw new Error('Forbidden keyword in SOURCE query.');
  if (trimmed.includes(';')) throw new Error('Multiple statements are not allowed.');
  if (/--|\/\*/.test(trimmed)) throw new Error('SQL comments are not allowed in SOURCE queries.');
}

/** Replaces connection-string secrets and Supabase hosts in error text. */
export function maskSecrets(text: string, dbUrl?: string): string {
  let out = text.replace(/[a-z]{20}\.supabase\.co/g, '<ref>.supabase.co');
  out = out.replace(/postgres(ql)?:\/\/[^\s'"]+/gi, 'postgresql://<redacted>');
  if (dbUrl) {
    out = out.split(dbUrl).join('<db-url>');
    try {
      const u = new URL(dbUrl);
      for (const piece of [decodeURIComponent(u.password), u.password, u.hostname])
        if (piece.length >= 4) out = out.split(piece).join('<redacted>');
    } catch {
      /* unparsable url: already replaced as a whole */
    }
  }
  return out;
}

/** Validates the shape of a db-url without echoing it. */
export function assertDbUrl(dbUrl: string): void {
  let u: URL;
  try {
    u = new URL(dbUrl);
  } catch {
    throw new Error('ELECTORAL_SOURCE_DATABASE_URL is not a valid URL.');
  }
  if (u.protocol !== 'postgresql:' && u.protocol !== 'postgres:')
    throw new Error('ELECTORAL_SOURCE_DATABASE_URL must be a postgres:// or postgresql:// URL.');
}

const TIMEOUT_RE = /^\d{1,4}(ms|s|min)$/;

/** The statement sequence sent to the CLI (the driver path runs the same steps via BEGIN READ ONLY). */
export function wrapReadOnly(sql: string, statementTimeout = '45s'): string {
  assertReadOnlySql(sql);
  if (!TIMEOUT_RE.test(statementTimeout))
    throw new Error(`invalid statement timeout: ${statementTimeout}`);
  return `BEGIN READ ONLY;
SET LOCAL statement_timeout = '${statementTimeout}';
SET LOCAL lock_timeout = '1s';
${sql.trim()};
COMMIT;`;
}

async function runViaDriver<T>(
  conn: SourceConnection,
  sql: string,
  statementTimeout: string,
): Promise<QueryResult<T>> {
  assertDbUrl(conn.dbUrl!);
  if (!TIMEOUT_RE.test(statementTimeout))
    throw new Error(`invalid statement timeout: ${statementTimeout}`);
  const client = postgres(conn.dbUrl!, {
    max: 1,
    prepare: false,
    idle_timeout: 5,
    connect_timeout: 15,
    onnotice: () => {},
    // int8 (count/sum) as Number, matching the CLI's JSON output
    types: { int8: { to: 20, from: [20], serialize: String, parse: Number } },
  });
  const t0 = performance.now();
  try {
    // sql.begin('read only', ...) issues `BEGIN READ ONLY`; both timeouts are LOCAL to it.
    const rows = (await client.begin('read only', async (tx) => {
      await tx.unsafe(`SET LOCAL statement_timeout = '${statementTimeout}'`);
      await tx.unsafe(`SET LOCAL lock_timeout = '1s'`);
      return tx.unsafe(sql.trim());
    })) as unknown as T[];
    const ms = Math.round(performance.now() - t0);
    return { rows: [...rows], ms, bytes: JSON.stringify(rows).length };
  } catch (err) {
    const e = err as { message: string };
    // the original error is deliberately NOT chained as `cause`: driver errors can embed the connection string
    // eslint-disable-next-line preserve-caught-error
    throw new Error(`SOURCE query failed: ${maskSecrets(e.message, conn.dbUrl).slice(0, 600)}`);
  } finally {
    await client.end({ timeout: 5 });
  }
}

function runViaCli<T>(
  conn: SourceConnection,
  sql: string,
  statementTimeout: string,
): QueryResult<T> {
  const wrapped = wrapReadOnly(sql, statementTimeout);
  const dir = mkdtempSync(join(tmpdir(), 'mm-etl-'));
  const file = join(dir, 'q.sql');
  writeFileSync(file, wrapped, { encoding: 'utf8', mode: 0o600 });
  // cli-workdir only: no secret is passed (the CLI uses its own session + isolated workdir)
  const args = [
    'db',
    'query',
    '--agent=no',
    '-o',
    'json',
    '-f',
    file,
    '--linked',
    '--workdir',
    conn.workdir!,
  ];
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
    throw new Error(`SOURCE query failed: ${maskSecrets(e.stderr ?? e.message).slice(0, 600)}`, {
      cause: err,
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  const ms = Math.round(performance.now() - t0);
  const start = out.indexOf('[');
  if (start < 0) return { rows: [], ms, bytes: out.length };
  const rows = JSON.parse(out.slice(start)) as T[];
  return { rows, ms, bytes: out.length - start };
}

export async function runQuery<T = Record<string, unknown>>(
  conn: SourceConnection,
  sql: string,
  opts: { statementTimeout?: string } = {},
): Promise<QueryResult<T>> {
  assertReadOnlySql(sql);
  const timeout = opts.statementTimeout ?? '45s';
  return conn.mode === 'db-url'
    ? runViaDriver<T>(conn, sql, timeout)
    : runViaCli<T>(conn, sql, timeout);
}
