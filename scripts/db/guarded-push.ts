/**
 * Guarded `supabase db push`: refuses to run unless the linked project ref is the
 * TARGET (operational) project. The SOURCE (legacy electoral DB) must never
 * receive migrations. Usage: npm run db:push [-- --dry-run]
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const TARGET_REF_PREFIX = 'wnclh';
const refFile = resolve(process.cwd(), 'supabase/.temp/project-ref');

if (!existsSync(refFile)) {
  console.error('db:push: repo is not linked to any Supabase project. Refusing.');
  process.exit(1);
}
const ref = readFileSync(refFile, 'utf8').trim();
if (!ref.startsWith(TARGET_REF_PREFIX)) {
  console.error(
    `db:push: linked project ref does not match the TARGET prefix (${TARGET_REF_PREFIX}…). Refusing to push migrations.`,
  );
  process.exit(1);
}
const sourceWorkdir = process.env.ELECTORAL_SOURCE_WORKDIR;
if (sourceWorkdir && resolve(sourceWorkdir) === process.cwd()) {
  console.error('db:push: cwd equals the SOURCE workdir. Refusing.');
  process.exit(1);
}

const args = ['db', 'push', '--linked', ...process.argv.slice(2)];
console.log(`db:push → TARGET (${ref.slice(0, 5)}…) :: supabase ${args.join(' ')}`);
try {
  execFileSync('supabase', args, { stdio: 'inherit', shell: process.platform === 'win32' });
} catch (err) {
  process.exit(
    typeof (err as { status?: number }).status === 'number'
      ? (err as { status: number }).status
      : 1,
  );
}
