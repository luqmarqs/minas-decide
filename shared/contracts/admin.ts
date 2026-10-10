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

// ---------------------------------------------------------------- admin management
/** POST /admin/admins — the e-mail is normalised (trim + lower-case) and never echoed back. */
export const AdminGrantInput = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
});
export type AdminGrantInput = z.infer<typeof AdminGrantInput>;

/**
 * GET /admin/admins item. E-mails are ALWAYS masked (`ab***@dominio`); `status: 'missing'` =
 * the id is in app_private.admins but Clerk no longer has the user (no e-mail, cannot act).
 */
export const AdminListItem = z.object({
  user_id: ClerkUserId,
  email_masked: z.string().nullable(),
  status: z.enum(['active', 'missing']),
  created_at: z.string(),
  /** who granted it: masked e-mail, 'bootstrap', or null when unknown/removed */
  created_by_masked: z.string().nullable(),
  is_self: z.boolean(),
});
export type AdminListItem = z.infer<typeof AdminListItem>;

export const AdminListResponse = z.object({ items: z.array(AdminListItem) });
export type AdminListResponse = z.infer<typeof AdminListResponse>;

/** POST /admin/admins (201 inserted, 200 already admin) */
export const AdminGrantResponse = z.object({
  user_id: ClerkUserId,
  email_masked: z.string(),
  created: z.boolean(),
});
export type AdminGrantResponse = z.infer<typeof AdminGrantResponse>;

/** DELETE /admin/admins/:userId */
export const AdminRevokeResponse = z.object({ user_id: ClerkUserId, removed: z.literal(true) });
export type AdminRevokeResponse = z.infer<typeof AdminRevokeResponse>;

// ---------------------------------------------------------------- metrics panel
/** GET /admin/metrics?days=7|30|90 (default 30). Aggregates only: no PII, no per-person rows. */
export const METRICS_PERIODS = [7, 30, 90] as const;
export const AdminMetricsQuery = z.object({
  days: z.coerce
    .number()
    .int()
    .refine((n) => (METRICS_PERIODS as readonly number[]).includes(n), 'Período inválido.')
    .default(30),
});
export type AdminMetricsQuery = z.infer<typeof AdminMetricsQuery>;

const Count = z.number().int().nonnegative();
const DayCount = z.object({ day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), count: Count });

/** Output of `public.svc_admin_metrics(p_days)` (migration 0015). */
export const AdminInternalMetrics = z.object({
  profiles: z.object({
    total: Count,
    last_7d: Count,
    last_30d: Count,
    by_day: z.array(DayCount),
  }),
  activities: z.object({
    by_status: z.record(z.string(), Count),
    upcoming_published: Count,
  }),
  rsvps: z.object({ total: Count, last_7d: Count }),
  groups: z.object({ active: Count, suspended: Count, pending_proposals: Count }),
  admins: z.object({ total: Count }),
  top_territories: z.array(
    z.object({ territory_id: TerritoryId, name: z.string(), registrations: Count }),
  ),
});
export type AdminInternalMetrics = z.infer<typeof AdminInternalMetrics>;

const LabelCount = z.object({ label: z.string(), count: Count });

/** Audience read from Umami on the server (aggregates only). */
export const AdminSiteMetrics = z.object({
  days: z.number().int(),
  visitors: Count,
  visits: Count,
  pageviews: Count,
  bounces: Count,
  /** 0..1, null when there were no visits */
  bounce_rate: z.number().min(0).max(1).nullable(),
  /** mean visit duration in seconds, null when there were no visits */
  avg_visit_seconds: z.number().nonnegative().nullable(),
  by_day: z.array(z.object({ day: z.string(), pageviews: Count, visitors: Count })),
  top_pages: z.array(LabelCount),
  top_referrers: z.array(LabelCount),
  devices: z.array(LabelCount),
});
export type AdminSiteMetrics = z.infer<typeof AdminSiteMetrics>;

export const AdminSiteStatus = z.enum(['ok', 'unconfigured', 'unavailable']);
export type AdminSiteStatus = z.infer<typeof AdminSiteStatus>;

export const AdminMetricsResponse = z.object({
  days: z.number().int(),
  internal: AdminInternalMetrics,
  site: AdminSiteMetrics.nullable(),
  site_status: AdminSiteStatus,
});
export type AdminMetricsResponse = z.infer<typeof AdminMetricsResponse>;
