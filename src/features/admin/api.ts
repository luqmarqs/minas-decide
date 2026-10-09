import { ActivitySuspensionResult, GroupSuspensionResult } from '@shared/contracts/admin';
/**
 * Admin API (admins table, checked server-side on every call; D35: no MFA). Response
 * schemas for moderation/manager/security-events are not in `shared/contracts`
 * yet; they mirror the Worker (`worker/routes/admin.ts`) and are listed as a
 * desired contract change in the FE-2 report.
 */
import { z } from 'zod';
import {
  AdminActivity,
  AdminGroupProposal,
  AdminRevealContactResponse,
  SecurityEvent,
  type AdminGroupPatch,
  type GroupManagerInput,
} from '@shared/contracts/admin.ts';
import { authedRequest } from '@/lib/auth';

export const GroupQueue = z.object({
  kind: z.literal('groups'),
  items: z.array(AdminGroupProposal),
  next_cursor: z.string().nullable(),
});
export type GroupQueue = z.infer<typeof GroupQueue>;

export const ActivityQueue = z.object({
  kind: z.literal('activities'),
  items: z.array(AdminActivity),
  next_cursor: z.string().nullable(),
});
export type ActivityQueue = z.infer<typeof ActivityQueue>;

export const GroupModerationResult = z.object({
  proposal_id: z.string().uuid(),
  group_id: z.string().uuid().optional(),
  status: z.enum(['active', 'rejected']),
});
export const ActivityModerationResult = z.object({
  id: z.string().uuid(),
  status: z.enum(['published', 'rejected']),
  version: z.number().int(),
});
export const AdminGroup = z.object({
  id: z.string().uuid(),
  display_name: z.string(),
  territory_id: z.string(),
  join_url: z.string(),
  status: z.string(),
  updated_at: z.string(),
});
export type AdminGroup = z.infer<typeof AdminGroup>;
export const ManagerResult = z.object({ id: z.string().uuid(), group_id: z.string().uuid() });
export const SecurityEventsPage = z.object({
  items: z.array(SecurityEvent),
  next_cursor: z.string().nullable(),
});
export type SecurityEventsPage = z.infer<typeof SecurityEventsPage>;

/** Results of POST /admin/groups/:id/(un)suspend and /admin/activities/:id/(un)suspend. */

export const GROUP_STATUS_FILTERS = [
  { value: 'pending', label: 'Pendentes' },
  { value: 'active', label: 'Aprovados' },
  { value: 'suspended', label: 'Suspensos' },
  { value: 'rejected', label: 'Rejeitados' },
  { value: 'all', label: 'Todos' },
];
export const ACTIVITY_STATUS_FILTERS = [
  { value: 'pending_review', label: 'Pendentes' },
  { value: 'published', label: 'Publicadas' },
  { value: 'suspended', label: 'Suspensas' },
  { value: 'rejected', label: 'Rejeitadas' },
  { value: 'cancelled', label: 'Canceladas' },
];

export const GROUP_STATUS_LABEL: Record<string, string> = {
  pending: 'Pendente',
  active: 'Aprovado',
  inactive: 'Inativo',
  rejected: 'Rejeitado',
  suspended: 'Suspenso',
};
export const ACTIVITY_STATUS_LABEL: Record<string, string> = {
  draft: 'Rascunho',
  pending_review: 'Pendente',
  published: 'Publicada',
  rejected: 'Rejeitada',
  cancelled: 'Cancelada',
  archived: 'Arquivada',
  suspended: 'Suspensa',
};

export function fetchGroupQueue(status: string, cursor: string | null, signal?: AbortSignal) {
  return authedRequest('/admin/queue', GroupQueue, {
    query: { kind: 'groups', status, limit: 20, cursor: cursor ?? undefined },
    signal,
  });
}

export function fetchActivityQueue(status: string, cursor: string | null, signal?: AbortSignal) {
  return authedRequest('/admin/queue', ActivityQueue, {
    query: { kind: 'activities', status, limit: 20, cursor: cursor ?? undefined },
    signal,
  });
}

export function moderateGroup(id: string, decision: 'approve' | 'reject', reason: string) {
  return authedRequest(
    `/admin/groups/${encodeURIComponent(id)}/${decision}`,
    GroupModerationResult,
    {
      method: 'POST',
      body: { reason },
    },
  );
}

export function moderateActivity(id: string, decision: 'approve' | 'reject', reason: string) {
  return authedRequest(
    `/admin/activities/${encodeURIComponent(id)}/${decision}`,
    ActivityModerationResult,
    { method: 'POST', body: { reason } },
  );
}

export function patchGroup(id: string, patch: z.input<typeof AdminGroupPatch>) {
  return authedRequest(`/admin/groups/${encodeURIComponent(id)}`, AdminGroup, {
    method: 'PATCH',
    body: patch,
  });
}

export function addGroupManager(groupId: string, input: z.input<typeof GroupManagerInput>) {
  return authedRequest(`/admin/groups/${encodeURIComponent(groupId)}/managers`, ManagerResult, {
    method: 'POST',
    body: input,
  });
}

export function fetchSecurityEvents(cursor: string | null, signal?: AbortSignal) {
  return authedRequest('/admin/security-events', SecurityEventsPage, {
    query: { limit: 20, cursor: cursor ?? undefined },
    signal,
  });
}

/** Suspend/lift a published GROUP (id = whatsapp group id, from `proposal.group_id`). */
export function setGroupSuspended(groupId: string, suspended: boolean, reason: string) {
  return authedRequest(
    `/admin/groups/${encodeURIComponent(groupId)}/${suspended ? 'suspend' : 'unsuspend'}`,
    GroupSuspensionResult,
    { method: 'POST', body: { reason } },
  );
}

/** Suspend a published activity; lifting it sends it back to review. */
export function setActivitySuspended(id: string, suspended: boolean, reason: string) {
  return authedRequest(
    `/admin/activities/${encodeURIComponent(id)}/${suspended ? 'suspend' : 'unsuspend'}`,
    ActivitySuspensionResult,
    { method: 'POST', body: { reason } },
  );
}

/**
 * Full proposer contact. Audited server-side and only allowed with a real aal2
 * session. The answer is never cached (no React Query) and lives only in the
 * component state of the open review.
 */
export function revealProposalContact(proposalId: string, reason?: string) {
  return authedRequest(
    `/admin/group-proposals/${encodeURIComponent(proposalId)}/reveal-contact`,
    AdminRevealContactResponse,
    { method: 'POST', body: reason ? { reason } : {} },
  );
}
