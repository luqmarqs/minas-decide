/**
 * Admin API (admins table + MFA, checked server-side on every call). Response
 * schemas for moderation/manager/security-events are not in `shared/contracts`
 * yet; they mirror the Worker (`worker/routes/admin.ts`) and are listed as a
 * desired contract change in the FE-2 report.
 */
import { z } from 'zod';
import {
  AdminActivity,
  AdminGroupProposal,
  SecurityEvent,
  type AdminGroupPatch,
  type GroupManagerInput,
} from '@shared/contracts/admin.ts';
import { PublicGroupsResponse } from '@shared/contracts/groups.ts';
import { apiRequest } from '@/lib/api';
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

export const GROUP_STATUS_FILTERS = [
  { value: 'pending', label: 'Pendentes' },
  { value: 'active', label: 'Aprovados' },
  { value: 'rejected', label: 'Rejeitados' },
  { value: 'all', label: 'Todos' },
];
export const ACTIVITY_STATUS_FILTERS = [
  { value: 'pending_review', label: 'Pendentes' },
  { value: 'published', label: 'Publicadas' },
  { value: 'rejected', label: 'Rejeitadas' },
  { value: 'cancelled', label: 'Canceladas' },
];

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

/**
 * The queue lists PROPOSALS; group edits need the GROUP id. Until the contract
 * exposes `group_id` on approved proposals, find it among the public active
 * groups of the territory by matching the invite URL.
 */
export async function findGroupForProposal(p: AdminGroupProposal): Promise<string | null> {
  const res = await apiRequest('/groups', PublicGroupsResponse, {
    query: { territory_id: p.territory_id },
  });
  if (res.fallback !== 'exact') return null;
  return res.items.find((g) => g.join_url === p.join_url_proposed)?.id ?? null;
}
