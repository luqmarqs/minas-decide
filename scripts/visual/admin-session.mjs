/**
 * Logs the agent's VALIDATOR user into the site through a Clerk sign-in token and captures the
 * admin screens (D46). The validator is a dedicated admin account (`validador@minasdecide.com.br`)
 * used only for visual/functional checks; it can be revoked in /admin (Administradores) or deleted
 * in the Clerk dashboard at any time.
 *
 *   CLERK_SECRET_KEY=<sk of the instance the site uses> node scripts/visual/admin-session.mjs \
 *     --base https://minasdecide.com.br --out docs/screenshots/admin/prod [--email <e-mail>] [--keep]
 *
 * Flow: Backend API `signInTokens.createSignInToken` (10 min, single use) → in the page
 * `Clerk.client.signIn.create({ strategy: 'ticket', ticket })` → `Clerk.setActive` → /admin.
 * Never prints the token. Screenshots: /admin tabs at 1440×900 and 390×844, light theme.
 */
import { mkdirSync } from 'node:fs';
import { createClerkClient } from '@clerk/backend';
import { chromium } from 'playwright';

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .map((a, i, all) =>
      a.startsWith('--')
        ? [
            a.slice(2),
            all[i + 1]?.startsWith('--') || all[i + 1] === undefined ? 'true' : all[i + 1],
          ]
        : null,
    )
    .filter(Boolean),
);
const base = args.base ?? 'http://127.0.0.1:8788';
const out = args.out ?? 'docs/screenshots/admin/local';
const email = (args.email ?? 'validador@minasdecide.com.br').toLowerCase();
const secretKey = process.env.CLERK_SECRET_KEY;
if (!secretKey) throw new Error('CLERK_SECRET_KEY ausente no ambiente');
mkdirSync(out, { recursive: true });

const clerk = createClerkClient({ secretKey });
const found = await clerk.users.getUserList({ emailAddress: [email], limit: 1 });
const user = found.data[0];
if (!user)
  throw new Error(
    `Usuário ${email} não existe nesta instância: rode scripts/db/bootstrap-admin.ts antes.`,
  );
const token = await clerk.signInTokens.createSignInToken({
  userId: user.id,
  expiresInSeconds: 600,
});
console.log('sign-in token criado para', email.replace(/^(.).*@/, '$1***@'));

const browser = await chromium.launch();
const results = [];
for (const [tag, viewport] of [
  ['d1440', { width: 1440, height: 900 }],
  ['m390', { width: 390, height: 844 }],
]) {
  const ctx = await browser.newContext({ viewport, locale: 'pt-BR', reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
  await page.goto(`${base}/entrar`, { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(globalThis.Clerk && globalThis.Clerk.loaded), null, {
    timeout: 30_000,
  });
  // The ticket is single-use: only the first context consumes it; later contexts reuse the
  // signed-in state by copying cookies? Clerk keeps the client in a cookie per context, so we
  // mint one ticket per context instead.
  const ticket =
    tag === 'd1440'
      ? token.token
      : (await clerk.signInTokens.createSignInToken({ userId: user.id, expiresInSeconds: 600 }))
          .token;
  const status = await page.evaluate(async (t) => {
    const c = globalThis.Clerk;
    const res = await c.client.signIn.create({ strategy: 'ticket', ticket: t });
    if (res.status === 'complete') await c.setActive({ session: res.createdSessionId });
    return res.status;
  }, ticket);
  if (status !== 'complete') throw new Error(`sign-in não completou: ${status}`);
  await page.goto(`${base}/admin`, { waitUntil: 'load' });
  await page.getByRole('heading', { name: 'Administração' }).waitFor({ timeout: 30_000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}/admin-home-${tag}.png`, fullPage: true });
  for (const tab of ['Métricas', 'Cadastros', 'Administradores']) {
    const t = page.getByRole('tab', { name: tab });
    if ((await t.count()) === 0) {
      results.push(`${tag}: aba ${tab} ausente`);
      continue;
    }
    await t.click();
    await page.waitForTimeout(3500);
    const slug = tab
      .normalize('NFD')
      .replace(/[^a-z]/gi, '')
      .toLowerCase();
    await page.screenshot({ path: `${out}/admin-${slug}-${tag}.png`, fullPage: true });
    results.push(`${tag}: ${tab} ok`);
  }
  if (errors.length) results.push(`${tag}: pageerrors ${JSON.stringify(errors)}`);
  await ctx.close();
}
await browser.close();
console.log(results.join('\n'));
