/**
 * Cloudflare Turnstile Siteverify client (spec §9.4).
 * https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
 */
export const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/**
 * Official Cloudflare TEST secrets. They do not validate a real challenge and always answer
 * with a fixed hostname ("example.com"), so hostname/action checks are skipped for them —
 * and they are refused outright when APP_ENV=production.
 */
export const TURNSTILE_TEST_SECRETS = new Set([
  '1x0000000000000000000000000000000AA', // always passes
  '2x0000000000000000000000000000000AA', // always fails
  '3x0000000000000000000000000000000AA', // yields "token already spent"
]);

export interface SiteverifyResult {
  success: boolean;
  hostname: string | null;
  action: string | null;
  errorCodes: string[];
}

export interface TurnstileVerifier {
  verify(input: {
    secret: string;
    token: string;
    remoteIp: string | null;
  }): Promise<SiteverifyResult>;
}

export function createSiteverifyClient(fetchImpl: typeof fetch = fetch): TurnstileVerifier {
  return {
    async verify({ secret, token, remoteIp }) {
      const form = new FormData();
      form.append('secret', secret);
      form.append('response', token);
      if (remoteIp && remoteIp !== 'local') form.append('remoteip', remoteIp);
      try {
        const res = await fetchImpl(SITEVERIFY_URL, { method: 'POST', body: form });
        if (!res.ok)
          return {
            success: false,
            hostname: null,
            action: null,
            errorCodes: [`http_${res.status}`],
          };
        const body = (await res.json()) as {
          success?: unknown;
          hostname?: unknown;
          action?: unknown;
          'error-codes'?: unknown;
        };
        return {
          success: body.success === true,
          hostname: typeof body.hostname === 'string' ? body.hostname : null,
          action: typeof body.action === 'string' && body.action ? body.action : null,
          errorCodes: Array.isArray(body['error-codes'])
            ? body['error-codes'].filter((x): x is string => typeof x === 'string')
            : [],
        };
      } catch {
        return { success: false, hostname: null, action: null, errorCodes: ['network'] };
      }
    },
  };
}
