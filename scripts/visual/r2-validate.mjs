// Validação real (rodada 2, FE-3) da UI contra o Worker + TARGET dev:
//  - P-SEC-1 "Confira seus dados" no retorno do magic link;
//  - P-AUTH-1 enrolamento TOTP em /conta/seguranca e MfaGate em /admin SEM bypass
//    (Worker com APP_ENV=staging: requireAdmin só aceita aal2 real);
//  - admin: aprovar, Revelar contato (auditado, aal2) e Suspender com group_id.
// Cria um usuário descartável (fe3-*@example.org) e apaga tudo no fim.
// Uso:
//   npx wrangler dev --env local --port 8796 --assets <dist>                                   (setup/cadastro)
//   npx wrangler dev --env local --port 8795 --assets <dist> --var APP_ENV:staging --var PUBLIC_ORIGIN:http://127.0.0.1:8795
//   node scripts/visual/r2-validate.mjs
// Segredos só de .dev.vars (nunca impressos); nada de PII no log além do e-mail de teste mascarado.
import { chromium } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import { totp } from './totp.mjs';

const LOCAL = process.env.BASE_LOCAL ?? 'http://127.0.0.1:8796';
const STRICT = process.env.BASE_STRICT ?? 'http://127.0.0.1:8795';
const OUT = process.env.OUT ?? 'docs/screenshots/final-r2';
const commit = execSync('git rev-parse --short HEAD').toString().trim();
const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
fs.mkdirSync(OUT, { recursive: true });

function devVars() {
  const out = {};
  for (const raw of fs.readFileSync('.dev.vars', 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const i = line.indexOf('=');
    out[line.slice(0, i).trim()] = line
      .slice(i + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
  }
  return out;
}
const env = devVars();
const url = env.SUPABASE_TARGET_URL;
if (!url || !new URL(url).hostname.startsWith('wnclh')) throw new Error('TARGET inválido');
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const svc = createClient(url, env.SUPABASE_TARGET_SERVICE_ROLE_KEY, opts);
const anonKey = env.SUPABASE_TARGET_ANON_KEY;

const tag = Date.now().toString(36);
const email = `fe3-${tag}@example.org`;
const results = [];
const log = (step, ok, detail = '') => {
  results.push({ step, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${step}${detail ? ` — ${detail}` : ''}`);
};
const shotName = (tela, dev, estado) => `${OUT}/${tela}-${dev}-${estado}-${date}-${commit}.png`;
const jwtAal = (token) => {
  try {
    return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).aal;
  } catch {
    return null;
  }
};

async function api(base, method, path, { token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${base}/api/v1${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

async function magicLinkHash() {
  const link = await svc.auth.admin.generateLink({ type: 'magiclink', email });
  if (link.error) throw new Error(`generateLink: ${link.error.code ?? link.error.status}`);
  return link.data.properties.hashed_token;
}

async function waitNextTotpWindow() {
  const ms = 30_000 - (Date.now() % 30_000) + 1500;
  await new Promise((r) => setTimeout(r, ms));
}

let userId = null;
let proposalId = null;
const browser = await chromium.launch();
try {
  // ---------------------------------------------------------------- setup (API)
  const anon = createClient(url, anonKey, opts);
  const { data: s } = await anon.auth.signInAnonymously();
  if (!s.session) throw new Error('anonymous sign-in failed');
  userId = s.user.id;
  const reg = await api(LOCAL, 'POST', '/registrations', {
    token: s.session.access_token,
    body: {
      display_name: 'Pessoa Validação FE3',
      email,
      phone: '(31) 99999-0003',
      territory_id: 'mg-3140001',
      terms_accepted: true,
      contact_opt_in: false,
      consent_version: 'rascunho-2026-10',
      turnstile_token: `fe3-${tag}-1`,
    },
  });
  log('setup: POST /registrations (provisória)', reg.status === 201, `status=${reg.status}`);
  const prop = await api(LOCAL, 'POST', '/groups/proposals', {
    token: s.session.access_token,
    body: {
      territory_id: 'mg-3140001',
      name_proposed: `Grupo Validação FE3 ${tag}`,
      join_url_proposed: `https://chat.whatsapp.com/Fe3${tag}AbCdEfGhIjKlMn`.slice(0, 48),
      proposer_name: 'Pessoa Validação FE3',
      proposer_email: email,
      proposer_phone: '(31) 99999-0003',
      responsibility_accepted: true,
      consent_version: 'rascunho-2026-10',
      turnstile_token: `fe3-${tag}-2`,
    },
  });
  proposalId = prop.json?.data?.id ?? null;
  log(
    'setup: POST /groups/proposals',
    prop.status === 201 && !!proposalId,
    `status=${prop.status}`,
  );
  const grant = await svc.rpc('svc_grant_admin', { p_user: userId });
  log('setup: svc_grant_admin (usuário descartável)', !grant.error);

  // ------------------------------------------------- A: retorno + "Confira seus dados"
  const ctxA = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
  });
  const a = await ctxA.newPage();
  await a.goto(`${STRICT}/autenticacao/retorno?token_hash=${await magicLinkHash()}&type=magiclink`);
  await a.getByRole('heading', { name: 'Confira seus dados' }).waitFor({ timeout: 20_000 });
  await a.getByText(/Mariana\/MG/).waitFor({ timeout: 30_000 });
  const reviewText = await a.locator('main').innerText();
  log(
    'P-SEC-1: retorno mostra "Confira seus dados" com telefone mascarado',
    /Pessoa Validação FE3/.test(reviewText) &&
      /\*\*/.test(reviewText) &&
      /Mariana/.test(reviewText),
  );
  log(
    'P-SEC-1: sem botão de continuar antes da revisão',
    (await a.getByRole('link', { name: /Ir para o mapa|Continuar/ }).count()) === 0,
  );
  await a.screenshot({ path: shotName('autenticacao-retorno', 'desktop1440', 'confira-dados') });
  await a.getByRole('button', { name: 'Está correto' }).click();
  await a.getByText('Dados conferidos').waitFor({ timeout: 15_000 });
  const tokenA = await a.evaluate(() => {
    const k = Object.keys(localStorage).find((x) => /^sb-.+-auth-token$/.test(x));
    return k ? JSON.parse(localStorage.getItem(k)).access_token : null;
  });
  const meAfter = await api(STRICT, 'GET', '/me', { token: tokenA });
  log(
    'P-SEC-1: PATCH /me {profile_reviewed:true} limpou o flag (GET /me real)',
    meAfter.json?.data?.profile_review_required === false,
  );

  // ------------------------------------------------- A: /conta/seguranca (enrolamento)
  await a.goto(`${STRICT}/conta/seguranca`);
  await a.getByRole('button', { name: 'Ativar verificação em duas etapas' }).click();
  await a.getByRole('img', { name: /QR code/ }).waitFor({ timeout: 20_000 });
  const secret = (await a.getByLabel('Chave secreta').innerText()).replace(/\s+/g, '');
  const qrSrc = await a.getByRole('img', { name: /QR code/ }).getAttribute('src');
  log(
    'P-AUTH-1: QR (data: SVG) + segredo em texto',
    /^data:image\/svg/.test(qrSrc ?? '') && secret.length >= 16,
  );
  await a.screenshot({
    path: shotName('conta-seguranca', 'desktop1440', 'enrolamento'),
    fullPage: true,
  });
  await a.getByLabel(/Código de 6 números/).fill(totp(secret));
  await a.getByRole('button', { name: 'Verificar e ativar' }).click();
  await a.getByText(/Autenticador ativado/).waitFor({ timeout: 20_000 });
  const tokenA2 = await a.evaluate(() => {
    const k = Object.keys(localStorage).find((x) => /^sb-.+-auth-token$/.test(x));
    return k ? JSON.parse(localStorage.getItem(k)).access_token : null;
  });
  log(
    'P-AUTH-1: enroll + challenge + verify (código RFC 6238 gerado em Node)',
    jwtAal(tokenA2) === 'aal2',
    `aal=${jwtAal(tokenA2)}`,
  );
  await ctxA.close();

  // ------------------------------------------------- no-bypass checks via API
  const nodeDevice = createClient(url, anonKey, opts);
  const v = await nodeDevice.auth.verifyOtp({
    type: 'magiclink',
    token_hash: await magicLinkHash(),
  });
  const aal1 = v.data.session?.access_token;
  log('sessão nova via magic link é aal1', jwtAal(aal1) === 'aal1', `aal=${jwtAal(aal1)}`);
  const q1 = await api(STRICT, 'GET', '/admin/queue?kind=groups&status=pending', { token: aal1 });
  log(
    'Worker APP_ENV=staging: /admin/queue com aal1 → 403 (sem bypass)',
    q1.status === 403,
    `status=${q1.status}`,
  );

  // ------------------------------------------------- B: /admin com MfaGate (sem bypass)
  const ctxB = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
  });
  const b = await ctxB.newPage();
  b.on('response', (r) => {
    if (r.url().includes('/reveal-contact') || r.url().includes('/suspend'))
      console.log(
        `  resposta ${new URL(r.url()).pathname.replace(/[0-9a-f-]{36}/g, ':id')} → ${r.status()}`,
      );
  });
  const adminAals = [];
  b.on('request', (r) => {
    if (r.url().includes('/api/v1/admin/')) {
      const h = r.headers().authorization ?? '';
      adminAals.push(jwtAal(h.replace(/^Bearer /, '')));
    }
  });
  await b.goto(
    `${STRICT}/autenticacao/retorno?token_hash=${await magicLinkHash()}&type=magiclink&next=/admin`,
  );
  await b.getByText(/E-mail confirmado/).waitFor({ timeout: 20_000 });
  await b.goto(`${STRICT}/admin`);
  await b.getByRole('heading', { name: 'Confirme o segundo fator' }).waitFor({ timeout: 20_000 });
  log(
    'MfaGate: /admin pede o código antes de carregar o painel',
    adminAals.length === 0,
    `admin_requests=${adminAals.length}`,
  );
  await b.screenshot({ path: shotName('admin', 'desktop1440', 'mfa-codigo') });
  await waitNextTotpWindow();
  await b.getByLabel(/Código de 6 números/).fill(totp(secret));
  await b.getByRole('button', { name: 'Verificar e continuar' }).click();
  await b.getByRole('tab', { name: 'Grupos' }).waitFor({ timeout: 20_000 });
  const item = b.locator('li', { hasText: `Grupo Validação FE3 ${tag}` });
  await item.getByRole('button', { name: 'Revisar' }).waitFor({ timeout: 20_000 });
  log(
    'MfaGate: painel carregou com JWT aal2 no Worker sem bypass',
    adminAals.length > 0 && adminAals.every((x) => x === 'aal2'),
    `aals=${[...new Set(adminAals)].join(',')}`,
  );
  await item.getByRole('button', { name: 'Revisar' }).click();
  await item.getByRole('button', { name: 'Aprovar' }).click();
  await b.getByLabel(/^Motivo/).fill('Validação FE-3: link e território conferidos');
  await b.getByRole('dialog').getByRole('button', { name: 'Aprovar' }).click();
  await item.getByText(/Proposta aprovada/).waitFor({ timeout: 20_000 });
  log(
    'admin: aprovação (aal2) e botão Suspender via group_id',
    (await item.getByRole('button', { name: 'Suspender grupo' }).count()) === 1,
  );

  await item.getByRole('button', { name: 'Revelar contato do proponente' }).click();
  await b.getByRole('button', { name: 'Revelar e registrar acesso' }).click();
  try {
    await item.getByText(/Acesso registrado na auditoria/).waitFor({ timeout: 20_000 });
  } catch (e) {
    console.log('  texto do item:', (await item.innerText()).slice(-400).replace(/\s+/g, ' '));
    throw e;
  }
  const revealed = await item.innerText();
  log(
    'admin: Revelar contato (aal2 real) mostra e-mail completo + aviso de auditoria',
    revealed.includes(email),
  );
  await item.scrollIntoViewIfNeeded();
  await b.screenshot({
    path: shotName('admin', 'desktop1440', 'suspender-revelar'),
    fullPage: true,
  });

  await item.getByRole('button', { name: 'Suspender grupo' }).click();
  await b.getByLabel(/^Motivo/).fill('Validação FE-3: suspensão de teste');
  await b.getByRole('dialog').getByRole('button', { name: 'Suspender' }).click();
  await item.getByText(/Grupo suspenso/).waitFor({ timeout: 20_000 });
  const pub = await api(STRICT, 'GET', '/groups?territory_id=mg-3140001');
  log(
    'admin: Suspender tira o grupo da resposta pública',
    !JSON.stringify(pub.json ?? {}).includes(`Grupo Validação FE3 ${tag}`),
    `status=${pub.status}`,
  );
  await item.getByRole('button', { name: 'Reativar grupo' }).waitFor({ timeout: 10_000 });
  log('admin: Reativar disponível após suspender', true);
  // Leaving the review hides the revealed contact.
  await item.getByRole('button', { name: 'Fechar' }).click();
  log(
    'admin: contato some ao fechar a revisão',
    !(await b.locator('main').innerText()).includes(email),
  );
  await ctxB.close();
} catch (err) {
  log('erro inesperado', false, err instanceof Error ? err.message.slice(0, 1500) : String(err));
} finally {
  await browser.close();
  // ---------------------------------------------------------------- cleanup
  try {
    if (proposalId) {
      const g = await svc.from('whatsapp_groups').select('id').eq('source_proposal_id', proposalId);
      const ids = (g.data ?? []).map((x) => x.id);
      if (ids.length) await svc.from('whatsapp_groups').delete().in('id', ids);
      await svc.rpc('svc_erase_group_proposals', {
        p_ids: [proposalId],
        p_request_id: 'fe3-validate',
      });
    }
    if (userId) await svc.auth.admin.deleteUser(userId);
    console.log('cleanup: usuário, proposta e grupo de teste removidos');
  } catch (e) {
    console.log(`cleanup FALHOU: ${e instanceof Error ? e.message : e}`);
  }
  fs.writeFileSync(
    `${OUT}/_validacao-real.json`,
    JSON.stringify({ commit, date, results }, null, 1),
  );
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passos OK`);
  process.exitCode = failed ? 1 : 0;
}
