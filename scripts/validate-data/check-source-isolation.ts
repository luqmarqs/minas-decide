/**
 * CI guard (spec §9.10): fail if any identifier of the legacy electoral Supabase
 * (SOURCE) appears in client bundle, Worker code, deploy config, public data or
 * example env files. The SOURCE project ref is read from a file OUTSIDE the repo
 * when available (operator machine); otherwise only the name-based patterns run.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, relative, resolve } from 'node:path';

const root = process.cwd();
const scanDirs = ['src', 'worker', 'shared', 'public', 'dist', 'e2e', 'supabase/migrations', '.github'];
const scanFiles = ['wrangler.jsonc', '.env.example', '.dev.vars.example', 'package.json', 'index.html'];
const allowedDirs = ['scripts/import-electoral'];

const patterns: { label: string; re: RegExp }[] = [
  { label: 'SOURCE project name', re: /dashboard-eleicoes-2026/i },
  { label: 'SOURCE env var', re: /SUPABASE_SOURCE_|ELECTORAL_SOURCE_DATABASE_URL=\S*(postgres|supabase)/i },
  { label: 'SOURCE table names (meta_*)', re: /\bmeta_(anuncios|localidades|observacoes|cache)\b/ },
  { label: 'service role in VITE var', re: /VITE_[A-Z_]*SERVICE_ROLE/ },
  { label: 'postgres connection string', re: /postgres(ql)?:\/\/[^\s"'`]+@/i },
];

const refFile = join(homedir(), '.minas-em-movimento', 'source.ref');
if (existsSync(refFile)) {
  const ref = readFileSync(refFile, 'utf8').trim();
  if (/^[a-z]{20}$/.test(ref)) patterns.push({ label: 'SOURCE project ref', re: new RegExp(ref) });
}

const skipExt = new Set(['.png', '.jpg', '.jpeg', '.webp', '.woff', '.woff2', '.pmtiles', '.ico']);
let violations = 0;
let scanned = 0;

function scanFile(abs: string) {
  const rel = relative(root, abs).replace(/\\/g, '/');
  if (allowedDirs.some((d) => rel.startsWith(d))) return;
  const ext = abs.slice(abs.lastIndexOf('.'));
  if (skipExt.has(ext)) return;
  const stat = statSync(abs);
  if (stat.size > 50 * 1024 * 1024) return;
  const text = readFileSync(abs, 'utf8');
  scanned++;
  for (const p of patterns) {
    if (p.re.test(text)) {
      violations++;
      console.error(`ISOLATION VIOLATION [${p.label}] in ${rel}`);
    }
  }
}

function walk(dir: string) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    const st = statSync(abs);
    if (st.isDirectory()) {
      if (entry === 'node_modules' || entry === '.git') continue;
      walk(abs);
    } else scanFile(abs);
  }
}

for (const d of scanDirs) walk(resolve(root, d));
for (const f of scanFiles) if (existsSync(resolve(root, f))) scanFile(resolve(root, f));

if (violations > 0) {
  console.error(`check:isolation FAILED — ${violations} violation(s) across ${scanned} files.`);
  process.exit(1);
}
console.log(`check:isolation OK — ${scanned} files scanned, no SOURCE identifiers found.`);
