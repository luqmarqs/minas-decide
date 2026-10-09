import { Hono, type Context } from 'hono';
import { MePatch, type MeResponse } from '../../shared/contracts/registration.ts';
import { maskEmail } from '../../shared/schemas/phone.ts';
import { sanitizePlainText } from '../../shared/schemas/sanitize.ts';
import type { AppBindings, AuthUser } from '../env.ts';
import { fail } from '../errors.ts';
import { ok, parseBody } from '../http.ts';
import { requireSession } from '../middleware/auth.ts';
import { noStore } from '../middleware/cache.ts';
import type { ProfileRow } from '../repositories/types.ts';

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
  };
}

me.get('/me', noStore, requireSession, async (c) => {
  const user = c.get('user')!;
  const profile = await c.get('deps').repo.getProfile(user.id);
  return ok(c, await buildMe(c, user, profile));
});

me.patch('/me', noStore, requireSession, async (c) => {
  const user = c.get('user')!;
  const patch = await parseBody(c, MePatch);
  const { repo } = c.get('deps');
  if (!(await repo.getProfile(user.id))) throw fail('NOT_FOUND', 'Cadastro não encontrado.');
  if (patch.selected_territory_id) {
    const [t] = await repo.getTerritories([patch.selected_territory_id]);
    if (!t)
      throw fail('VALIDATION_ERROR', undefined, {
        selected_territory_id: 'Território inexistente.',
      });
  }
  const updated = await repo.updateProfile(user.id, {
    ...(patch.display_name !== undefined
      ? { display_name: sanitizePlainText(patch.display_name, 120) }
      : {}),
    ...(patch.selected_territory_id !== undefined
      ? { selected_territory_id: patch.selected_territory_id }
      : {}),
    ...(patch.contact_opt_in !== undefined ? { contact_opt_in: patch.contact_opt_in } : {}),
  });
  return ok(c, await buildMe(c, user, updated));
});
