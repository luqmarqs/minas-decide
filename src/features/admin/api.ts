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
  AdminGrantResponse,
  AdminGroupProposal,
  AdminListResponse,
  AdminMetricsResponse,
  AdminRegistrationsResponse,
  REGISTRATIONS_PAGE_SIZE,
  AdminRevealContactResponse,
  AdminRevokeResponse,
  SecurityEvent,
  type AdminGroupPatch,
  type GroupManagerInput,
} from '@shared/contracts/admin.ts';
import { ApiError } from '@shared/contracts/api.ts';
import { ApiClientError, buildApiUrl, GENERIC_ERROR_MESSAGES } from '@/lib/api';
import { authedRequest, getSessionToken } from '@/lib/auth';

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

/** Administrators list (e-mails always masked by the server). Never cached. */
export function fetchAdmins(signal?: AbortSignal) {
  return authedRequest('/admin/admins', AdminListResponse, { signal });
}

/** Grants admin to an EXISTING Clerk account with a verified primary e-mail. Audited. */
export function grantAdmin(email: string) {
  return authedRequest('/admin/admins', AdminGrantResponse, { method: 'POST', body: { email } });
}

/** Removes an admin (never yourself nor the last one). Audited. */
export function revokeAdmin(userId: string) {
  return authedRequest(`/admin/admins/${encodeURIComponent(userId)}`, AdminRevokeResponse, {
    method: 'DELETE',
  });
}

/** Metrics panel (aggregates only; internal numbers + Umami audience, read server-side). */
export function fetchAdminMetrics(days: 7 | 30 | 90, signal?: AbortSignal) {
  return authedRequest('/admin/metrics', AdminMetricsResponse, { query: { days }, signal });
}

/** Registrations list (PERSONAL DATA, admin only, audited server-side). Page size is fixed (50). */
export function fetchRegistrations(cursor: string | null, q: string, signal?: AbortSignal) {
  return authedRequest('/admin/registrations', AdminRegistrationsResponse, {
    query: { limit: REGISTRATIONS_PAGE_SIZE, cursor: cursor ?? undefined, q: q || undefined },
    signal,
  });
}

/**
 * Downloads the whole (filtered) base as CSV. The route streams text/csv, so this is a plain
 * `fetch` with the Clerk token (not `authedRequest`, which expects the JSON envelope); errors
 * still come back as the JSON envelope and are mapped to `ApiClientError`.
 */
export async function downloadRegistrationsCsv(
  q: string,
  signal?: AbortSignal,
): Promise<{ blob: Blob; filename: string }> {
  const send = async (token: string): Promise<Response> => {
    try {
      return await fetch(buildApiUrl('/admin/registrations/export.csv', { q: q || undefined }), {
        headers: { Authorization: `Bearer ${token}`, Accept: 'text/csv' },
        credentials: 'include',
        signal,
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err;
      throw new ApiClientError('NETWORK_ERROR', GENERIC_ERROR_MESSAGES.NETWORK_ERROR);
    }
  };
  const token = await getSessionToken();
  if (!token) throw new ApiClientError('UNAUTHENTICATED', GENERIC_ERROR_MESSAGES.UNAUTHENTICATED);
  let res = await send(token);
  if (res.status === 401) {
    const fresh = await getSessionToken({ skipCache: true });
    if (fresh && fresh !== token) res = await send(fresh);
  }
  if (!res.ok) {
    const parsed = ApiError.safeParse(await res.json().catch(() => null));
    if (parsed.success) {
      const e = parsed.data.error;
      throw new ApiClientError(e.code, e.message || GENERIC_ERROR_MESSAGES[e.code], {
        status: res.status,
        requestId: parsed.data.meta.request_id,
      });
    }
    throw new ApiClientError('HTTP_ERROR', GENERIC_ERROR_MESSAGES.HTTP_ERROR, {
      status: res.status,
    });
  }
  let blob: Blob;
  try {
    blob = await res.blob();
  } catch {
    // the stream broke mid-way (server error): never hand a truncated file to the person
    throw new ApiClientError('HTTP_ERROR', GENERIC_ERROR_MESSAGES.HTTP_ERROR, {
      status: res.status,
    });
  }
  const m = /filename="([^"/]+)"/.exec(res.headers.get('Content-Disposition') ?? '');
  return { blob, filename: m?.[1] ?? 'cadastros-minas-decide.csv' };
}
