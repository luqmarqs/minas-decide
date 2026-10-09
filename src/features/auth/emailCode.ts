/**
 * Clerk sign-in by e-mail code (ADR 0005): `signIn.create({ identifier })` →
 * `prepareFirstFactor({ strategy: 'email_code' })` → `attemptFirstFactor` → `setActive`.
 * Shared by `/entrar` and by the sign-up form ("este e-mail já tem cadastro").
 *
 * FE-12: Clerk lives in a lazy chunk; the resources come from the session store and every
 * step waits for Clerk to be loaded (rejects with `not_loaded` after a timeout).
 */
import { useCallback, useRef } from 'react';
import { AuthFlowError } from '@/lib/clerk';
import { useClerkSnapshot, whenClerkReady, type ClerkSnapshot } from '@/lib/session';

export const CODE_RE = /^\d{6}$/;

/** Keeps only digits (people paste "123 456" or "123-456"). */
export function normalizeCode(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, 6);
}

/** Loaded Clerk resources, or `AuthFlowError('not_loaded')`. */
export async function readyClerk(): Promise<ClerkSnapshot> {
  try {
    return await whenClerkReady();
  } catch {
    throw new AuthFlowError('not_loaded');
  }
}

export function useEmailCodeSignIn({ lazy = false }: { lazy?: boolean } = {}) {
  const ready = !!useClerkSnapshot({ lazy });
  const emailAddressId = useRef<string | null>(null);

  const prepare = useCallback(async () => {
    const { signIn } = await readyClerk();
    if (!signIn || !emailAddressId.current) throw new AuthFlowError('not_loaded');
    await signIn.prepareFirstFactor({
      strategy: 'email_code',
      emailAddressId: emailAddressId.current,
    });
  }, []);

  /** Starts a sign-in and sends the code. */
  const start = useCallback(
    async (email: string) => {
      const { signIn } = await readyClerk();
      if (!signIn) throw new AuthFlowError('not_loaded');
      const res = await signIn.create({ identifier: email });
      const factor = res.supportedFirstFactors?.find((f) => f.strategy === 'email_code');
      if (!factor || !('emailAddressId' in factor)) throw new AuthFlowError('strategy_unavailable');
      emailAddressId.current = factor.emailAddressId;
      await prepare();
    },
    [prepare],
  );

  /** Checks the code and activates the session. */
  const verify = useCallback(async (code: string) => {
    const { signIn, setActive } = await readyClerk();
    if (!signIn || !setActive) throw new AuthFlowError('not_loaded');
    const res = await signIn.attemptFirstFactor({ strategy: 'email_code', code });
    if (res.status !== 'complete' || !res.createdSessionId) {
      throw new AuthFlowError('flow_incomplete');
    }
    await setActive({ session: res.createdSessionId });
  }, []);

  return { ready, start, resend: prepare, verify };
}
