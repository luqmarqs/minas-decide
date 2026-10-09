/**
 * ClerkAuthGateway.verify with REAL `verifyToken` from @clerk/backend, networkless: the tokens
 * are RS256 JWTs signed here with a throw-away key whose PEM public key is passed as
 * CLERK_JWT_KEY (same code path the Worker uses in production when that key is configured).
 * The Backend API (`getUser`) is covered by the live test supabase/tests/clerk-live.test.ts.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { ClerkAuthGateway, allowedParties, azpAllowed } from '../repositories/clerk.ts';
import { configProblems } from '../middleware/config-check.ts';
import { testEnv } from './fakes.ts';

let privateKey: CryptoKey;
let otherKey: CryptoKey;
let publicPem = '';

const b64url = (data: ArrayBuffer | Uint8Array | string): string => {
  const bytes =
    typeof data === 'string'
      ? new TextEncoder().encode(data)
      : data instanceof Uint8Array
        ? data
        : new Uint8Array(data);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

async function rsaPair(): Promise<CryptoKeyPair> {
  return (await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  )) as CryptoKeyPair;
}

async function sign(payload: Record<string, unknown>, key = privateKey): Promise<string> {
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: 'ins_test' }));
  const body = b64url(JSON.stringify(payload));
  const sig = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(`${head}.${body}`),
  );
  return `${head}.${body}.${b64url(sig)}`;
}

const now = () => Math.floor(Date.now() / 1000);
const claims = (over: Record<string, unknown> = {}) => ({
  sub: 'user_2abcDEF123',
  sid: 'sess_2abc',
  iss: 'https://test-instance.clerk.accounts.dev',
  iat: now() - 5,
  nbf: now() - 10,
  exp: now() + 60,
  sts: 'active',
  v: 2,
  ...over,
});

beforeAll(async () => {
  const pair = await rsaPair();
  privateKey = pair.privateKey;
  otherKey = (await rsaPair()).privateKey;
  const spki = new Uint8Array(
    (await crypto.subtle.exportKey('spki', pair.publicKey)) as ArrayBuffer,
  );
  const b64 = btoa(String.fromCharCode(...spki));
  publicPem = `-----BEGIN PUBLIC KEY-----\n${b64.match(/.{1,64}/g)!.join('\n')}\n-----END PUBLIC KEY-----`;
});

const gateway = () =>
  new ClerkAuthGateway(
    testEnv({
      CLERK_JWT_KEY: publicPem,
      PUBLIC_ORIGIN: 'http://127.0.0.1:5173',
      ALLOWED_ORIGINS: 'http://localhost:5173',
    }),
  );

describe('ClerkAuthGateway.verify (real verifyToken, networkless)', () => {
  it('valid token -> subject and claims', async () => {
    const r = await gateway().verify(await sign(claims()));
    expect(r?.sub).toBe('user_2abcDEF123');
    expect(r?.claims.sts).toBe('active');
  });

  it('valid token with an allowed azp -> accepted', async () => {
    const r = await gateway().verify(await sign(claims({ azp: 'http://localhost:5173' })));
    expect(r?.sub).toBe('user_2abcDEF123');
  });

  it('forged signature, tampered payload, expired, not-yet-valid, foreign azp -> null', async () => {
    const g = gateway();
    const good = await sign(claims());
    const [h, , s] = good.split('.');
    const tampered = `${h}.${b64url(JSON.stringify(claims({ sub: 'user_attacker' })))}.${s}`;
    const cases = {
      forged: await sign(claims(), otherKey),
      tampered,
      expired: await sign(claims({ exp: now() - 120, iat: now() - 300, nbf: now() - 300 })),
      notYet: await sign(claims({ nbf: now() + 600, iat: now() + 600, exp: now() + 900 })),
      foreignAzp: await sign(claims({ azp: 'https://evil.example' })),
      notAUser: await sign(claims({ sub: 'org_123' })),
      garbage: 'abc.def.ghi',
    };
    for (const [name, token] of Object.entries(cases)) {
      expect([name, await g.verify(token)]).toEqual([name, null]);
    }
  });

  it('token without azp (Backend-API minted) is refused outside local/test', async () => {
    for (const APP_ENV of ['staging', 'production']) {
      const g = new ClerkAuthGateway(
        testEnv({ APP_ENV, CLERK_JWT_KEY: publicPem, PUBLIC_ORIGIN: 'https://app.example' }),
      );
      expect([APP_ENV, await g.verify(await sign(claims()))]).toEqual([APP_ENV, null]);
      const withAzp = await g.verify(await sign(claims({ azp: 'https://app.example' })));
      expect([APP_ENV, withAzp?.sub]).toEqual([APP_ENV, 'user_2abcDEF123']);
    }
    expect(azpAllowed(testEnv({ APP_ENV: 'local' }), undefined)).toBe(true);
    expect(azpAllowed(testEnv({ APP_ENV: 'staging' }), undefined)).toBe(false);
  });

  it('authorized parties = PUBLIC_ORIGIN + ALLOWED_ORIGINS, normalised', () => {
    expect(
      allowedParties(
        testEnv({ PUBLIC_ORIGIN: 'https://a.example/', ALLOWED_ORIGINS: ' https://b.example ,' }),
      ),
    ).toEqual(['https://a.example', 'https://b.example']);
  });
});

describe('CLERK_SECRET_KEY config check', () => {
  it('missing/malformed key, or a test key in production -> misconfigured (name only)', () => {
    expect(configProblems(testEnv({ CLERK_SECRET_KEY: '' }))).toContain('CLERK_SECRET_KEY');
    expect(configProblems(testEnv({ CLERK_SECRET_KEY: 'pk_test_abcdefghijkl' }))).toContain(
      'CLERK_SECRET_KEY',
    );
    expect(
      configProblems(
        testEnv({ APP_ENV: 'production', CLERK_SECRET_KEY: 'sk_test_abcdefghijklmnop' }),
      ),
    ).toContain('CLERK_SECRET_KEY');
    expect(configProblems(testEnv())).toEqual([]);
    expect(configProblems(testEnv({ APP_ENV: 'production' }))).toEqual([]);
  });
});
