/**
 * QA3-05 / QA3-01: ClerkAuthGateway error mapping with @clerk/backend mocked (no network):
 * token problems -> null (401); JWKS/network/config failures -> SERVICE_UNAVAILABLE (503);
 * Backend API 429/5xx/no response -> SERVICE_UNAVAILABLE; 404 -> null; other 4xx -> INTERNAL_ERROR.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TokenVerificationError, TokenVerificationErrorReason } from '@clerk/backend/errors';
import { AppError } from '../errors.ts';
import { testEnv } from './fakes.ts';

const verifyToken = vi.fn();
const getUser = vi.fn();

vi.mock('@clerk/backend', () => ({
  verifyToken: (...args: unknown[]) => verifyToken(...args),
  createClerkClient: () => ({ users: { getUser: (...a: unknown[]) => getUser(...a) } }),
}));

const { ClerkAuthGateway, isVerificationOutage } = await import('../repositories/clerk.ts');

const gw = () => new ClerkAuthGateway(testEnv());

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return 'resolved';
  } catch (e) {
    return e instanceof AppError ? e.code : 'other';
  }
}

beforeEach(() => {
  verifyToken.mockReset();
  getUser.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('verify: outage vs bad token', () => {
  it('network failure (fetch TypeError) -> SERVICE_UNAVAILABLE', async () => {
    verifyToken.mockRejectedValue(new TypeError('fetch failed'));
    expect(await code(gw().verify('a.b.c'))).toBe('SERVICE_UNAVAILABLE');
  });

  it('JWKS load failure / config reasons -> SERVICE_UNAVAILABLE', async () => {
    for (const reason of [
      TokenVerificationErrorReason.RemoteJWKFailedToLoad,
      TokenVerificationErrorReason.JWKFailedToResolve,
      TokenVerificationErrorReason.InvalidSecretKey,
      TokenVerificationErrorReason.LocalJWKMissing,
    ]) {
      verifyToken.mockRejectedValueOnce(new TokenVerificationError({ reason, message: 'x' }));
      expect([reason, await code(gw().verify('a.b.c'))]).toEqual([reason, 'SERVICE_UNAVAILABLE']);
    }
  });

  it('token problems -> null (401 upstream)', async () => {
    for (const reason of [
      TokenVerificationErrorReason.TokenExpired,
      TokenVerificationErrorReason.TokenInvalid,
      TokenVerificationErrorReason.TokenInvalidSignature,
      TokenVerificationErrorReason.TokenInvalidAlgorithm,
      TokenVerificationErrorReason.TokenNotActiveYet,
      TokenVerificationErrorReason.JWKKidMismatch,
    ]) {
      verifyToken.mockRejectedValueOnce(new TokenVerificationError({ reason, message: 'x' }));
      expect([reason, await gw().verify('a.b.c')]).toEqual([reason, null]);
    }
  });

  it('logs only the reason, never the token', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    verifyToken.mockRejectedValue(new TypeError('fetch failed'));
    await code(gw().verify('secret-token-value.x.y'));
    expect(JSON.stringify(err.mock.calls)).not.toContain('secret-token-value');
  });

  it('isVerificationOutage classification', () => {
    expect(isVerificationOutage(new Error('boom'))).toBe(true);
    expect(isVerificationOutage(null)).toBe(true);
    expect(
      isVerificationOutage(
        new TokenVerificationError({
          reason: TokenVerificationErrorReason.TokenExpired,
          message: '',
        }),
      ),
    ).toBe(false);
  });
});

describe('getUser: Backend API error mapping', () => {
  it('429, 5xx and no response -> SERVICE_UNAVAILABLE (never 500)', async () => {
    for (const e of [{ status: 429 }, { status: 500 }, { status: 503 }, new TypeError('x')]) {
      getUser.mockRejectedValueOnce(e);
      expect(await code(gw().getUser('user_abc'))).toBe('SERVICE_UNAVAILABLE');
    }
  });

  it('404 -> null; other 4xx (e.g. rejected key) -> INTERNAL_ERROR', async () => {
    getUser.mockRejectedValueOnce({ status: 404 });
    expect(await gw().getUser('user_abc')).toBeNull();
    getUser.mockRejectedValueOnce({ status: 401 });
    expect(await code(gw().getUser('user_abc'))).toBe('INTERNAL_ERROR');
  });
});
