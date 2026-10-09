/**
 * Activity contracts. Public projection never exposes creator identity,
 * reviewer, or moderation notes (spec §7.6).
 */
import { z } from 'zod';
import { TerritoryId } from './territory.ts';

export const ActivityStatus = z.enum([
  'draft',
  'pending_review',
  'published',
  'rejected',
  'cancelled',
  'archived',
]);
export type ActivityStatus = z.infer<typeof ActivityStatus>;

export const ActivityType = z.enum([
  'panfletagem',
  'encontro',
  'reuniao',
  'caminhada',
  'mutirao',
  'outro',
]);
export type ActivityType = z.infer<typeof ActivityType>;

export const ACTIVITY_TYPE_LABEL_PT: Record<ActivityType, string> = {
  panfletagem: 'Panfletagem',
  encontro: 'Encontro',
  reuniao: 'Reunião',
  caminhada: 'Caminhada',
  mutirao: 'Mutirão',
  outro: 'Outro',
};

export const PublicContactType = z.enum(['whatsapp', 'email', 'instagram']);
export type PublicContactType = z.infer<typeof PublicContactType>;

export const PublicActivity = z.object({
  id: z.string().uuid(),
  title: z.string(),
  type: ActivityType,
  description_sanitized: z.string(),
  starts_at: z.string(), // ISO UTC
  ends_at: z.string().nullable(),
  timezone: z.literal('America/Sao_Paulo'),
  location_public: z.string(),
  /** [lon, lat] */
  coordinates: z.tuple([z.number(), z.number()]).nullable(),
  territory_id: TerritoryId,
  status: z.enum(['published', 'cancelled']),
  rsvp_count_approx: z.number().int().nonnegative(),
  contact_public: z.object({ type: PublicContactType, value: z.string() }).nullable(),
  updated_at: z.string(),
});
export type PublicActivity = z.infer<typeof PublicActivity>;

export const PublicActivitiesQuery = z.object({
  bbox: z
    .string()
    .regex(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?,-?\d+(\.\d+)?$/)
    .optional(),
  territory_id: TerritoryId.optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
});
export type PublicActivitiesQuery = z.infer<typeof PublicActivitiesQuery>;

export const ActivityInput = z.object({
  title: z.string().trim().min(5).max(120),
  type: ActivityType,
  description: z.string().trim().min(10).max(2000),
  territory_id: TerritoryId,
  public_address: z.string().trim().min(5).max(240),
  /** [lon, lat] */
  coordinates: z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]),
  location_confirmed: z.literal(true),
  starts_at: z.string().datetime(),
  ends_at: z.string().datetime().nullable().optional(),
  timezone: z.literal('America/Sao_Paulo'),
  public_contact_opt_in: z.boolean().default(false),
  public_contact_type: PublicContactType.nullable().optional(),
  public_contact_value: z.string().trim().max(120).nullable().optional(),
  turnstile_token: z.string().min(1).max(2048).optional(),
});
export type ActivityInput = z.infer<typeof ActivityInput>;

/** Partial update. No defaults here: only keys present in the body are applied. */
export const ActivityPatch = ActivityInput.omit({ public_contact_opt_in: true }).partial().extend({
  public_contact_opt_in: z.boolean().optional(),
  version: z.number().int().nonnegative(),
});
export type ActivityPatch = z.infer<typeof ActivityPatch>;

export const MyActivity = PublicActivity.omit({ status: true }).extend({
  status: ActivityStatus,
  review_reason: z.string().nullable(),
  version: z.number().int(),
});
export type MyActivity = z.infer<typeof MyActivity>;

export const RsvpState = z.object({
  activity_id: z.string().uuid(),
  going: z.boolean(),
  rsvp_count_approx: z.number().int().nonnegative(),
});
export type RsvpState = z.infer<typeof RsvpState>;

export const RsvpInput = z.object({
  idempotency_key: z.string().min(8).max(128).optional(),
});
