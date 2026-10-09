import { z } from 'zod';
import type {
  ActivityInput,
  ActivityPatch,
  PublicContactType,
} from '../../shared/contracts/activities.ts';
import { normalizeBrazilPhone } from '../../shared/schemas/phone.ts';
import { sanitizePlainText } from '../../shared/schemas/sanitize.ts';
import { fail } from '../errors.ts';
import type { ActivityRow, ActivityUpdate, ActivityWrite } from '../repositories/types.ts';

const INSTAGRAM_RE = /^@?[A-Za-z0-9._]{1,30}$/;
const emailSchema = z.string().email().max(120);

/** Validates/normalizes an opt-in public contact. Opt-out clears the stored contact. */
export function normalizeContact(
  optIn: boolean,
  type: PublicContactType | null | undefined,
  value: string | null | undefined,
): Pick<ActivityWrite, 'public_contact_opt_in' | 'public_contact_type' | 'public_contact_value'> {
  if (!optIn)
    return { public_contact_opt_in: false, public_contact_type: null, public_contact_value: null };
  if (!type)
    throw fail('VALIDATION_ERROR', undefined, {
      public_contact_type: 'Escolha o tipo de contato público.',
    });
  const raw = (value ?? '').trim();
  let normalized: string | null = null;
  if (type === 'whatsapp') normalized = normalizeBrazilPhone(raw);
  else if (type === 'email')
    normalized = emailSchema.safeParse(raw.toLowerCase()).success ? raw.toLowerCase() : null;
  else if (INSTAGRAM_RE.test(raw)) normalized = raw.startsWith('@') ? raw : `@${raw}`;
  if (!normalized)
    throw fail('VALIDATION_ERROR', undefined, {
      public_contact_value: 'Contato público inválido.',
    });
  return {
    public_contact_opt_in: true,
    public_contact_type: type,
    public_contact_value: normalized,
  };
}

function checkTimes(startsAt: string, endsAt: string | null, now: number): void {
  const s = Date.parse(startsAt);
  if (!(s > now))
    throw fail('VALIDATION_ERROR', undefined, {
      starts_at: 'A atividade precisa começar no futuro.',
    });
  if (endsAt !== null && !(Date.parse(endsAt) > s)) {
    throw fail('VALIDATION_ERROR', undefined, { ends_at: 'O término deve ser depois do início.' });
  }
}

export function buildActivityWrite(input: ActivityInput, now: number): ActivityWrite {
  const endsAt = input.ends_at ?? null;
  checkTimes(input.starts_at, endsAt, now);
  const title = sanitizePlainText(input.title, 120);
  if (title.length < 5) throw fail('VALIDATION_ERROR', undefined, { title: 'Título muito curto.' });
  return {
    title,
    type: input.type,
    description: input.description,
    description_sanitized: sanitizePlainText(input.description, 2000),
    starts_at: new Date(input.starts_at).toISOString(),
    ends_at: endsAt ? new Date(endsAt).toISOString() : null,
    public_address: sanitizePlainText(input.public_address, 240),
    location_lon: input.coordinates[0],
    location_lat: input.coordinates[1],
    territory_id: input.territory_id,
    ...normalizeContact(
      input.public_contact_opt_in,
      input.public_contact_type,
      input.public_contact_value,
    ),
  };
}

/** Fields whose change on a published activity sends it back to moderation (T21). */
export const SENSITIVE_FIELDS = [
  'title',
  'description_sanitized',
  'starts_at',
  'ends_at',
  'public_address',
  'location_lon',
  'location_lat',
  'territory_id',
  'type',
] as const;

/**
 * NOTE: ActivityPatch = ActivityInput.partial() and Zod 4 still applies `.default(false)` of
 * public_contact_opt_in inside optional fields, so the parsed patch ALWAYS carries it. We only
 * honour keys that were actually present in the raw JSON body (`presentKeys`).
 */
export function buildActivityPatch(
  current: ActivityRow,
  parsed: ActivityPatch,
  presentKeys: ReadonlySet<string>,
  now: number,
): { update: ActivityUpdate; sensitive: boolean } {
  const patch: Partial<ActivityPatch> = {};
  for (const [k, v] of Object.entries(parsed)) {
    if (presentKeys.has(k)) (patch as Record<string, unknown>)[k] = v;
  }
  const update: ActivityUpdate = {};
  if (patch.title !== undefined) {
    update.title = sanitizePlainText(patch.title, 120);
    if (update.title.length < 5)
      throw fail('VALIDATION_ERROR', undefined, { title: 'Título muito curto.' });
  }
  if (patch.type !== undefined) update.type = patch.type;
  if (patch.description !== undefined) {
    update.description = patch.description;
    update.description_sanitized = sanitizePlainText(patch.description, 2000);
  }
  if (patch.public_address !== undefined)
    update.public_address = sanitizePlainText(patch.public_address, 240);
  if (patch.coordinates !== undefined) {
    update.location_lon = patch.coordinates[0];
    update.location_lat = patch.coordinates[1];
  }
  if (patch.territory_id !== undefined) update.territory_id = patch.territory_id;
  if (patch.starts_at !== undefined) update.starts_at = new Date(patch.starts_at).toISOString();
  if (patch.ends_at !== undefined)
    update.ends_at = patch.ends_at ? new Date(patch.ends_at).toISOString() : null;
  if (patch.starts_at !== undefined || patch.ends_at !== undefined) {
    checkTimes(
      update.starts_at ?? current.starts_at,
      update.ends_at !== undefined ? update.ends_at : current.ends_at,
      now,
    );
  }
  if (
    patch.public_contact_opt_in !== undefined ||
    patch.public_contact_type !== undefined ||
    patch.public_contact_value !== undefined
  ) {
    Object.assign(
      update,
      normalizeContact(
        patch.public_contact_opt_in ?? current.public_contact_opt_in,
        patch.public_contact_type !== undefined
          ? patch.public_contact_type
          : current.public_contact_type,
        patch.public_contact_value !== undefined
          ? patch.public_contact_value
          : current.public_contact_value,
      ),
    );
  }

  const fieldSensitive = SENSITIVE_FIELDS.some((f) => {
    const next = update[f];
    return next !== undefined && next !== current[f];
  });
  // QA-1 F02: publishing or changing a public contact is sensitive (re-moderation);
  // switching the contact OFF is never sensitive and takes effect immediately (T27).
  const contactChanged = (
    ['public_contact_opt_in', 'public_contact_type', 'public_contact_value'] as const
  ).some((f) => update[f] !== undefined && update[f] !== current[f]);
  const contactOn = (update.public_contact_opt_in ?? current.public_contact_opt_in) === true;
  const sensitive = fieldSensitive || (contactChanged && contactOn);
  return { update, sensitive };
}
