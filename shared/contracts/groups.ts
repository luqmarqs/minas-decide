/**
 * WhatsApp group contracts. PUBLIC projection must never include managers,
 * proposer contact, or moderation notes (spec §7.6).
 */
import { z } from 'zod';
import { TerritoryId } from './territory.ts';

export const GroupStatus = z.enum(['pending', 'active', 'inactive', 'rejected']);
export type GroupStatus = z.infer<typeof GroupStatus>;

export const PublicGroup = z.object({
  id: z.string().uuid(),
  display_name: z.string(),
  territory_id: TerritoryId,
  join_url: z.string().url(),
  status: z.literal('active'),
  updated_at: z.string(),
});
export type PublicGroup = z.infer<typeof PublicGroup>;

export const PublicGroupsResponse = z.object({
  items: z.array(PublicGroup),
  /** exact = group for the requested territory; municipality = fallback to parent; none */
  fallback: z.enum(['exact', 'municipality', 'none']),
});
export type PublicGroupsResponse = z.infer<typeof PublicGroupsResponse>;

/** WhatsApp official invite hosts (spec §9.8). Validated server-side. */
export const WHATSAPP_INVITE_HOSTS = ['chat.whatsapp.com'] as const;

export function isWhatsAppInviteUrl(u: string): boolean {
  try {
    const url = new URL(u);
    return (
      url.protocol === 'https:' &&
      (WHATSAPP_INVITE_HOSTS as readonly string[]).includes(url.hostname) &&
      /^\/[A-Za-z0-9_-]{10,64}$/.test(url.pathname) &&
      url.search === '' &&
      url.hash === '' &&
      url.username === '' &&
      url.password === ''
    );
  } catch {
    return false;
  }
}

export const WhatsAppInviteUrl = z
  .string()
  .trim()
  .max(200)
  .refine(
    isWhatsAppInviteUrl,
    'Informe um link de convite oficial do WhatsApp (https://chat.whatsapp.com/...).',
  );

export const GroupProposalInput = z.object({
  territory_id: TerritoryId,
  name_proposed: z.string().trim().min(3).max(80),
  join_url_proposed: WhatsAppInviteUrl,
  proposer_name: z.string().trim().min(2).max(120),
  proposer_email: z.string().trim().toLowerCase().email().max(254),
  proposer_phone: z.string().trim().min(8).max(20),
  responsibility_accepted: z.literal(true),
  consent_version: z.string().min(1).max(20),
  turnstile_token: z.string().min(1).max(2048),
  idempotency_key: z.string().min(8).max(128).optional(),
});
export type GroupProposalInput = z.infer<typeof GroupProposalInput>;

export const GroupProposalResult = z.object({
  id: z.string().uuid(),
  status: z.literal('pending'),
});
export type GroupProposalResult = z.infer<typeof GroupProposalResult>;
