import { Hono, type Context } from 'hono';
import { MePatch, type MeResponse } from '../../shared/contracts/registration.ts';
import { maskEmail, maskPhone } from '../../shared/schemas/phone.ts';
import { sanitizePlainText } from '../../shared/schemas/sanitize.ts';
import type { AppBindings, AuthUser } from '../env.ts';
import { fail } from '../errors.ts';
import { ok, parseBody } from '../http.ts';
import { invalidateUserCache, requireSession, syncProfileEmail } from '../middleware/auth.ts';
import { noStore } from '../middleware/cache.ts';
import { rateLimit, rateLimitPerUser } from '../middleware/rate-limit.ts';
import type { ProfilePatch, ProfileRow } from '../repositories/types.ts';

export const me = new Hono<AppBindings>();

/**
 * `email_verified` = Clerk verified the primary e-mail AND the profile (if any) is verified and
 * active. `is_anonymous` and `profile_review_required` are always false since ADR 0005.
 * `is_admin` follows the same rule as requireAdmin (QA3-06: a suspended account is not admin).
 * `email_sync_conflict` is only present (true) when the Clerk e-mail could not be synced
 * (QA3-02).
 */
export async function buildMe(
  c: Context<AppBindings>,
  user: AuthUser,
  profile: ProfileRow | null,
  emailSyncConflict = false,
): Promise<MeResponse> {
  const verified =
    user.email_confirmed &&
    (!profile ||
      (profile.email_verification_state === 'verified' && profile.account_state === 'active'));
  const email = user.email ?? profile?.email_contact ?? null;
  return {
    user_id: user.id,
    display_name: profile?.display_name ?? null,
    email_masked: email ? maskEmail(email) : null,
    email_verified: verified,
    is_anonymous: false,
    selected_territory_id: profile?.selected_territory_id ?? null,
    is_admin:
      user.email_confirmed && profile?.account_state !== 'suspended'
        ? await c.get('deps').repo.isAdmin(user.id)
        : false,
    account_state: profile?.account_state ?? 'active',
    phone_masked: profile?.phone_e164 ? maskPhone(profile.phone_e164) : null,
    profile_review_required: false,
    ...(emailSyncConflict ? { email_sync_conflict: true } : {}),
  };
}

/** QA3-01: rate limited per IP + user; QA3-02: an e-mail sync conflict never fails GET /me. */
me.get('/me', noStore, requireSession, rateLimitPerUser('account_read'), async (c) => {
  const user = c.get('user')!;
  const profile = await c.get('deps').repo.getProfile(user.id);
  if (!profile) return ok(c, await buildMe(c, user, null));
  const synced = await syncProfileEmail(c, user, profile);
  return ok(c, await buildMe(c, user, synced.profile, synced.conflict));
});

/**
 * Only the session owner edits their own profile (no admin route changes phone/name). A phone
 * change is audited without PII. `profile_reviewed` (P-SEC-1) is accepted for compatibility and
 * ignored: there is no post-promotion review since ADR 0005. A suspended account cannot edit
 * its profile (QA3-06: 403 FORBIDDEN). The cached Clerk lookup of the user is dropped.
 */
me.patch('/me', noStore, rateLimit('me_write'), requireSession, async (c) => {
  const user = c.get('user')!;
  const patch = await parseBody(c, MePatch);
  const { repo } = c.get('deps');
  invalidateUserCache(c, user.id);
  const current = await repo.getProfile(user.id);
  if (!current) throw fail('NOT_FOUND', 'Cadastro não encontrado.');
  if (current.account_state !== 'active') throw fail('FORBIDDEN', 'Conta suspensa.');
  const phoneBefore = current.phone_e164;
  if (patch.selected_territory_id) {
    const [t] = await repo.getTerritories([patch.selected_territory_id]);
    if (!t)
      throw fail('VALIDATION_ERROR', undefined, {
        selected_territory_id: 'Território inexistente.',
      });
  }
  const update: ProfilePatch = {
    ...(patch.display_name !== undefined
      ? { display_name: sanitizePlainText(patch.display_name, 120) }
      : {}),
    ...(patch.selected_territory_id !== undefined
      ? { selected_territory_id: patch.selected_territory_id }
      : {}),
    ...(patch.contact_opt_in !== undefined ? { contact_opt_in: patch.contact_opt_in } : {}),
    ...(patch.phone !== undefined ? { phone: patch.phone } : {}),
  };
  const updated = await repo.updateProfile(user.id, update);
  if (!updated) throw fail('NOT_FOUND', 'Cadastro não encontrado.');
  if (patch.phone !== undefined && patch.phone !== phoneBefore) {
    await repo.recordAudit({
      actor: user.id,
      action: 'profile.phone_change',
      entity_type: 'profile',
      entity_id: user.id,
      request_id: c.get('requestId'),
    });
  }
  return ok(c, await buildMe(c, user, updated));
});
