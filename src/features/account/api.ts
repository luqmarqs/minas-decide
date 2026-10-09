import type { z } from 'zod';
import { MeResponse, type MePatch } from '@shared/contracts/registration.ts';
import { authedRequest } from '@/lib/auth';

export type MePatchInput = z.input<typeof MePatch>;

/** PATCH /me (own profile only). Returns the updated, masked profile. */
export function patchMe(body: MePatchInput) {
  return authedRequest('/me', MeResponse, { method: 'PATCH', body });
}
