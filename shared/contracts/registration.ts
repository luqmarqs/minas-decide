import { z } from 'zod';
import { normalizeBrazilPhone } from '../schemas/phone.ts';
import { TerritoryId } from './territory.ts';

export const BrazilPhone = z
  .string()
  .trim()
  .transform((v, ctx) => {
    const n = normalizeBrazilPhone(v);
    if (!n) {
      ctx.addIssue({ code: 'custom', message: 'Informe um WhatsApp brasileiro válido com DDD.' });
      return z.NEVER;
    }
    return n;
  });

export const RegistrationInput = z.object({
  display_name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().max(254),
  phone: BrazilPhone,
  territory_id: TerritoryId,
  terms_accepted: z.literal(true),
  contact_opt_in: z.boolean().default(false),
  consent_version: z.string().min(1).max(20),
  turnstile_token: z.string().min(1).max(2048),
});
export type RegistrationInput = z.infer<typeof RegistrationInput>;

export const RegistrationResult = z.object({
  profile_id: z.string().uuid(),
  territory_id: TerritoryId,
  email_verification_state: z.enum(['unverified', 'pending', 'verified']),
  session_state: z.enum(['provisional', 'verified']),
});
export type RegistrationResult = z.infer<typeof RegistrationResult>;

export const MeResponse = z.object({
  user_id: z.string().uuid(),
  display_name: z.string().nullable(),
  email_masked: z.string().nullable(),
  email_verified: z.boolean(),
  is_anonymous: z.boolean(),
  selected_territory_id: TerritoryId.nullable(),
  is_admin: z.boolean(),
  account_state: z.enum(['active', 'suspended']),
});
export type MeResponse = z.infer<typeof MeResponse>;

export const MePatch = z.object({
  display_name: z.string().trim().min(2).max(120).optional(),
  selected_territory_id: TerritoryId.optional(),
  contact_opt_in: z.boolean().optional(),
});

export const SendLinkInput = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  turnstile_token: z.string().min(1).max(2048),
});

/** Neutral response: never reveals whether the e-mail exists. */
export const SendLinkResponse = z.object({
  sent: z.literal(true),
  message: z.string(),
});

/** POST /auth/confirm-email — promotes a provisional (anonymous) identity after
 *  the e-mail was confirmed through an OTP/magic-link session. */
export const ConfirmEmailResponse = z.object({
  user_id: z.string().uuid(),
  email_verified: z.boolean(),
  is_anonymous: z.boolean(),
  promoted: z.boolean(),
  /** client must call refreshSession() to get a JWT with is_anonymous=false */
  refresh_required: z.boolean(),
});
export type ConfirmEmailResponse = z.infer<typeof ConfirmEmailResponse>;
