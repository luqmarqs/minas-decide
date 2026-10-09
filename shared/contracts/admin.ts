import { z } from 'zod';
import { ActivityStatus } from './activities.ts';
import { GroupStatus } from './groups.ts';
import { TerritoryId } from './territory.ts';
import { ClerkUserId } from './registration.ts';

export const ModerationDecision = z.object({
  reason: z.string().trim().min(3).max(500),
});
export type ModerationDecision = z.infer<typeof ModerationDecision>;

export const AdminQueueQuery = z.object({
  kind: z.enum(['groups', 'activities']).default('groups'),
  status: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().optional(),
});

export const AdminGroupProposal = z.object({
  id: z.string().uuid(),
  /** group created on approval, when any */
  group_id: z.string().uuid().nullable(),
  territory_id: TerritoryId,
  name_proposed: z.string(),
  join_url_proposed: z.string(),
  proposer_name: z.string(),
  proposer_email_masked: z.string(),
  proposer_phone_masked: z.string(),
  status: GroupStatus,
  created_at: z.string(),
  reviewed_at: z.string().nullable(),
  review_reason: z.string().nullable(),
});
export type AdminGroupProposal = z.infer<typeof AdminGroupProposal>;

export const AdminActivity = z.object({
  id: z.string().uuid(),
  title: z.string(),
  type: z.string(),
  description: z.string(),
  territory_id: TerritoryId,
  public_address: z.string(),
  starts_at: z.string(),
  status: ActivityStatus,
  creator_user_id: ClerkUserId,
  public_contact_opt_in: z.boolean(),
  created_at: z.string(),
  reviewed_at: z.string().nullable(),
  review_reason: z.string().nullable(),
  version: z.number().int(),
});
export type AdminActivity = z.infer<typeof AdminActivity>;

export const AdminGroupPatch = z.object({
  display_name: z.string().trim().min(3).max(80).optional(),
  join_url: z.string().trim().max(200).optional(),
  status: z.enum(['active', 'inactive']).optional(),
  reason: z.string().trim().min(3).max(500),
});

export const GroupManagerInput = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().toLowerCase().email().nullable().optional(),
  phone: z.string().trim().max(20).nullable().optional(),
  role_label: z.string().trim().max(60).default('responsável'),
});

export const ModerationResult = z.object({
  id: z.string().uuid(),
  status: z.string(),
  reviewed_at: z.string(),
});
export type ModerationResult = z.infer<typeof ModerationResult>;

export const AdminQueueResponse = z.object({
  kind: z.enum(['groups', 'activities']),
  items: z.array(z.union([AdminGroupProposal, AdminActivity])),
  next_cursor: z.string().nullable(),
});
export type AdminQueueResponse = z.infer<typeof AdminQueueResponse>;

/** POST /admin/group-proposals/:id/reveal-contact — admin only, audited (no aal2 since D35). */
export const AdminRevealContactResponse = z.object({
  proposal_id: z.string().uuid(),
  proposer_email: z.string(),
  proposer_phone: z.string(),
  revealed_at: z.string(),
});
export type AdminRevealContactResponse = z.infer<typeof AdminRevealContactResponse>;

/** POST /admin/groups/:id/suspend|unsuspend */
export const GroupSuspensionResult = z.object({
  id: z.string().uuid(),
  status: GroupStatus,
  updated_at: z.string(),
});
export type GroupSuspensionResult = z.infer<typeof GroupSuspensionResult>;

/** POST /admin/activities/:id/suspend|unsuspend (lifting returns to review) */
export const ActivitySuspensionResult = z.object({
  id: z.string().uuid(),
  status: z.enum(['suspended', 'pending_review']),
  version: z.number().int(),
});
export type ActivitySuspensionResult = z.infer<typeof ActivitySuspensionResult>;

export const SecurityEvent = z.object({
  id: z.string().uuid(),
  created_at: z.string(),
  route: z.string(),
  event_type: z.string(),
  block_code: z.string().nullable(),
});
