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

/** Clerk user id (ADR 0005) */
export const ClerkUserId = z.string().regex(/^user_[A-Za-z0-9]{1,64}$/, 'id de usuário inválido');

/**
 * POST /registrations — volunteer sign-up WITHOUT an account (D48). The answer is the same
 * whether the e-mail was new or already registered (no enumeration): no ids, no PII.
 */
export const RegistrationResult = z.object({
  territory_id: TerritoryId,
  status: z.literal('received'),
});
export type RegistrationResult = z.infer<typeof RegistrationResult>;

/** POST /registrations/account — same body as the volunteer form (organizer profile). */
export const AccountProfileInput = RegistrationInput;
export type AccountProfileInput = RegistrationInput;

/**
 * POST /registrations/account — organizer profile on top of a Clerk session (ADR 0005; the
 * volunteer sign-up no longer needs an account since D48).
 */
export const AccountProfileResult = z.object({
  profile_id: ClerkUserId,
  territory_id: TerritoryId,
  /** Clerk verifies the e-mail before any session exists (ADR 0005) */
  email_verification_state: z.literal('verified'),
  session_state: z.literal('verified'),
});
export type AccountProfileResult = z.infer<typeof AccountProfileResult>;

export const MeResponse = z.object({
  user_id: ClerkUserId,
  display_name: z.string().nullable(),
  email_masked: z.string().nullable(),
  email_verified: z.boolean(),
  /** always false since Clerk (kept for compatibility) */
  is_anonymous: z.boolean(),
  selected_territory_id: TerritoryId.nullable(),
  is_admin: z.boolean(),
  account_state: z.enum(['active', 'suspended']),
  /** masked E.164, e.g. +55 (31) 9****-**88 */
  phone_masked: z.string().nullable(),
  /** @deprecated always false since Clerk (ADR 0005) */
  profile_review_required: z.boolean().optional().default(false),
  /**
   * QA3-02: present (true) when the verified primary e-mail in Clerk could not be copied to the
   * profile because another profile already holds it. The profile keeps its previous contact;
   * `email_masked` shows the Clerk address. Absent otherwise.
   */
  email_sync_conflict: z.boolean().optional(),
});
export type MeResponse = z.infer<typeof MeResponse>;

export const MePatch = z.object({
  display_name: z.string().trim().min(2).max(120).optional(),
  selected_territory_id: TerritoryId.optional(),
  contact_opt_in: z.boolean().optional(),
  phone: BrazilPhone.optional(),
  /** @deprecated ignored since Clerk (ADR 0005) */
  profile_reviewed: z.literal(true).optional(),
});
