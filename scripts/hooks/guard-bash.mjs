#!/usr/bin/env node
/**
 * Claude Code PreToolUse hook for Bash. Blocks commands that could write to a
 * Supabase project outside the guarded script, publish to Cloudflare, or touch
 * the private credentials directory. Exit code 2 = block with message.
 * This is defense in depth; CI, grants and human review remain the real controls.
 */
import { readFileSync } from 'node:fs';

let input = '';
try {
  input = readFileSync(0, 'utf8');
} catch {
  process.exit(0);
}
let cmd = '';
try {
  const parsed = JSON.parse(input);
  cmd = String(parsed?.tool_input?.command ?? '');
} catch {
  process.exit(0);
}

const blocked = [
  /\bsupabase\s+db\s+(reset|push|pull)\b/i,
  /\bsupabase\s+migration\s+(up|repair|squash)\b/i,
  /\bsupabase\s+link\b/i,
  /\bsupabase\s+projects\s+delete\b/i,
  /\bsupabase\s+db\s+query\b(?![^\n]*BEGIN READ ONLY)/i,
  /\bwrangler\s+(deploy|publish|secret|delete)\b/i,
  /\bgit\s+push\b/i,
  /\.minas-em-movimento[\\/](source\.ref|target-dev\.env|projects\.json)/i,
  /\b(DROP|TRUNCATE|ALTER|CREATE|INSERT|UPDATE|DELETE|VACUUM|REINDEX)\b[^\n]*--workdir[^\n]*source-readonly/i,
];

for (const re of blocked) {
  if (re.test(cmd)) {
    process.stderr.write(
      `guard-bash: comando bloqueado por política do projeto (${re}). Use os scripts npm guardados ou peça autorização humana.\n`,
    );
    process.exit(2);
  }
}
process.exit(0);
