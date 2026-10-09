/**
 * Minimal `.dev.vars` loader for Node scripts and DB tests. Parses KEY=VALUE lines
 * (ignores blanks/comments, strips optional surrounding quotes) and copies them into
 * `process.env` without overwriting values already set. Never prints values.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export function parseDevVars(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) out[key] = value;
  }
  return out;
}

/** Loads `.dev.vars` (or the given file) into process.env. Returns the loaded key names. */
export function loadDevVars(file = resolve(process.cwd(), '.dev.vars')): string[] {
  if (!existsSync(file)) return [];
  const vars = parseDevVars(readFileSync(file, 'utf8'));
  for (const [k, v] of Object.entries(vars)) {
    if (process.env[k] === undefined) process.env[k] = v;
  }
  return Object.keys(vars);
}

export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var ${name} (expected in .dev.vars)`);
  return v;
}

/** Guard: refuse to run against anything that is not the TARGET project. */
export function assertTargetUrl(url: string): void {
  const host = new URL(url).hostname;
  if (!host.startsWith('wnclh')) {
    throw new Error('Refusing: SUPABASE_TARGET_URL does not point to the TARGET project (wnclh…).');
  }
}
