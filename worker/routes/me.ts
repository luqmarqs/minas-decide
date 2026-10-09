import { Hono, type Context } from 'hono';
import { MePatch, type MeResponse } from '../../shared/contracts/registration.ts';
import { maskEmail, maskPhone } from '../../shared/schemas/phone.ts';
import { sanitizePlainText } from '../../shared/schemas/sanitize.ts';
import type { AppBindings, AuthUser } from '../env.ts';
import { fail } from '../errors.ts';
import { ok, parseBody } from '../http.ts';
import { requireSession } from '../middleware/auth.ts';
import { noStore } from '../middleware/cache.ts';
import { rateLimit } from '../middleware/rate-limit.ts';
import type { ProfilePatch, ProfileRow } from '../repositories/types.ts';

export const me = new Hono<AppBindings>();

export async function buildMe(
  c: Context<AppBindings>,
  user: AuthUser,
  profile: ProfileRow | null,
): Promise<MeResponse> {
  const { repo } = c.get('deps');
  const verified =
    !user.is_anonymous && user.email_confirmed && (await repo.isEmailVerified(user.id));
  const email = user.email ?? profile?.email_contact ?? null;
  return {
    user_id: user.id,
    display_name: profile?.display_name ?? null,
    email_masked: email ? maskEmail(email) : null,
    email_verified: verified,
    is_anonymous: user.is_anonymous,
    selected_territory_id: profile?.selected_territory_id ?? null,
    is_admin: user.is_anonymous ? false : await repo.isAdmin(user.id),
    account_state: profile?.account_state ?? 'active',
    phone_masked: profile?.phone_e164 ? maskPhone(profile.phone_e164) : null,
    profile_review_required: Boolean(profile?.review_required_at),
  };
}

me.get('/me', noStore, requireSession, async (c) => {
  const user = c.get('user')!;
  const profile = await c.get('deps').repo.getProfile(user.id);
  return ok(c, await buildMe(c, user, profile));
});

/**
 * Only the session owner edits their own profile (no admin route changes phone/name).
 * P-SEC-1: `phone` is editable and `profile_reviewed: true` clears the review flag set at
 * promotion; both are audited without PII (only the user id and which kind of change).
 */
me.patch('/me', noStore, rateLimit('me_write'), requireSession, async (c) => {
  const user = c.get('user')!;
  const patch = await parseBody(c, MePatch);
  const { repo } = c.get('deps');
  const current = await repo.getProfile(user.id);
  if (!current) throw fail('NOT_FOUND', 'Cadastro não encontrado.');
  const phoneBefore = current.phone_e164;
  const reviewPending = Boolean(current.review_required_at);
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
    ...(patch.profile_reviewed === true ? { review_required: false } : {}),
  };
  const updated = await repo.updateProfile(user.id, update);
  if (!updated) throw fail('NOT_FOUND', 'Cadastro não encontrado.');
  const requestId = c.get('requestId');
  if (patch.phone !== undefined && patch.phone !== phoneBefore) {
    await repo.recordAudit({
      actor: user.id,
      action: 'profile.phone_change',
      entity_type: 'profile',
      entity_id: user.id,
      request_id: requestId,
    });
  }
  if (patch.profile_reviewed === true && reviewPending) {
    await repo.recordAudit({
      actor: user.id,
      action: 'profile.review',
      entity_type: 'profile',
      entity_id: user.id,
      request_id: requestId,
    });
  }
  return ok(c, await buildMe(c, user, updated));
});
