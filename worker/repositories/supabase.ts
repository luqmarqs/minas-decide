/**
 * Supabase (TARGET) implementation of Repo (identity lives in Clerk — see ./clerk.ts).
 *
 * - Public tables/views (`territories`, `whatsapp_groups`, `activities`, `*_public`) are
 *   accessed through PostgREST with the service role, AFTER the route authorized the call.
 * - Private data (`app_private.*`) is reachable only through `public.svc_*` RPCs that are
 *   executable exclusively by service_role (see migration 0007).
 * - Postgres errors are mapped to stable AppError codes; raw messages are never forwarded.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { ActivityStatus } from '../../shared/contracts/activities.ts';
import type { Database } from '../../shared/types/database.ts';
import type { Env } from '../env.ts';
import { type AppError, fail } from '../errors.ts';
import type {
  ActivityRow,
  ActivityUpdate,
  ActivityWrite,
  Cursor,
  GroupPatch,
  GroupProposalRow,
  GroupRow,
  GroupStatusRow,
  NewGroupManager,
  NewGroupProposal,
  NewProfile,
  ProfilePatch,
  ProfileRow,
  PublicActivityQuery,
  PublicActivityRow,
  PublicGroupRow,
  Repo,
  RevealedContact,
  RsvpIdentity,
  SecurityEventRow,
  TerritoryRow,
} from './types.ts';

type Db = SupabaseClient<Database>;
type PgError = { code?: string; message?: string } | null;

const CLIENT_OPTS = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
} as const;

export function serviceClient(env: Env): Db {
  return createClient<Database>(
    env.SUPABASE_TARGET_URL,
    env.SUPABASE_TARGET_SERVICE_ROLE_KEY,
    CLIENT_OPTS,
  );
}

/** Maps a PostgREST/Postgres error to a public AppError. Logs only the SQLSTATE. */
export function mapPgError(error: NonNullable<PgError>, context: string): AppError {
  switch (error.code) {
    case 'PT400':
    case '22P02':
    case '23514':
      return fail('VALIDATION_ERROR');
    case 'PT403':
      return fail('FORBIDDEN');
    case 'PT404':
      return fail('NOT_FOUND');
    case 'PT409':
    case '23505':
      return fail('CONFLICT');
    case 'PT422':
      return fail('UNPROCESSABLE');
    case '23503':
      return fail('VALIDATION_ERROR', undefined, { territory_id: 'Território inexistente.' });
    default:
      console.error(
        JSON.stringify({
          level: 'error',
          where: `repo.${context}`,
          pg_code: error.code ?? 'unknown',
        }),
      );
      return fail('INTERNAL_ERROR');
  }
}

function check<T>(res: { data: T; error: PgError }, context: string): T {
  if (res.error) throw mapPgError(res.error, context);
  return res.data;
}

const TERRITORY_COLS =
  'id,type,name,normalized_name,slug,parent_id,ibge_code,municipality_name,centroid_lon,centroid_lat,data_quality';
const ACTIVITY_COLS =
  'id,creator_user_id,territory_id,title,type,description,description_sanitized,starts_at,ends_at,timezone,public_address,location_lon,location_lat,status,public_contact_opt_in,public_contact_type,public_contact_value,contact_public_type,contact_public_value,reviewed_at,review_reason,version,created_at,updated_at';
const PUBLIC_ACTIVITY_COLS =
  'id,title,type,description_sanitized,starts_at,ends_at,timezone,location_public,location_lon,location_lat,territory_id,status,contact_public_type,contact_public_value,rsvp_count,updated_at';
const PUBLIC_GROUP_COLS = 'id,display_name,territory_id,join_url,status,updated_at';

/** PostgREST filter values must not contain reserved characters. */
function safeIso(v: string): string {
  if (!/^[0-9T:.+\-Z]+$/.test(v)) throw fail('VALIDATION_ERROR');
  return v;
}
/** Clerk user id (`user_…`), safe inside PostgREST filters. */
function safeUserId(v: string): string {
  if (!/^user_[A-Za-z0-9]{1,64}$/.test(v)) throw fail('VALIDATION_ERROR');
  return v;
}
function safeUuid(v: string): string {
  if (!/^[0-9a-f-]{36}$/i.test(v)) throw fail('VALIDATION_ERROR');
  return v;
}

export class SupabaseRepo implements Repo {
  private readonly db: Db;

  constructor(env: Env) {
    this.db = serviceClient(env);
  }

  /** Untyped RPC helper: generated types mark nullable args as non-null. */
  private async rpc<T>(
    fn: keyof Database['public']['Functions'],
    args: Record<string, unknown>,
  ): Promise<T> {
    const call = this.db.rpc as unknown as (
      f: string,
      a: Record<string, unknown>,
    ) => PromiseLike<{ data: unknown; error: PgError }>;
    const res = await call.call(this.db, fn, args);
    if (res.error) throw mapPgError(res.error, fn);
    return res.data as T;
  }

  // ------------------------------------------------------------------ territories
  async searchTerritories(q: string, limit: number): Promise<TerritoryRow[]> {
    const res = await this.db
      .from('territories')
      .select(TERRITORY_COLS)
      .ilike('normalized_name', `%${q}%`)
      .neq('type', 'state')
      .order('normalized_name')
      .limit(Math.min(limit * 4, 200));
    return check(res, 'searchTerritories') as TerritoryRow[];
  }

  async getTerritories(ids: string[]): Promise<TerritoryRow[]> {
    if (ids.length === 0) return [];
    const res = await this.db.from('territories').select(TERRITORY_COLS).in('id', ids);
    return check(res, 'getTerritories') as TerritoryRow[];
  }

  async countChildren(id: string): Promise<number> {
    const res = await this.db
      .from('territories')
      .select('id', { count: 'exact', head: true })
      .eq('parent_id', id);
    if (res.error) throw mapPgError(res.error, 'countChildren');
    return res.count ?? 0;
  }

  async listChildIds(id: string): Promise<string[]> {
    const res = await this.db.from('territories').select('id').eq('parent_id', id).limit(1000);
    return (check(res, 'listChildIds') as { id: string }[]).map((r) => r.id);
  }

  // ------------------------------------------------------------------ groups
  async listActiveGroups(territoryId: string): Promise<PublicGroupRow[]> {
    const res = await this.db
      .from('whatsapp_groups_public')
      .select(PUBLIC_GROUP_COLS)
      .eq('territory_id', territoryId)
      .order('updated_at', { ascending: false })
      .limit(20);
    return check(res, 'listActiveGroups') as PublicGroupRow[];
  }

  async createGroupProposal(
    p: NewGroupProposal,
  ): Promise<{ id: string; status: string; created: boolean }> {
    return this.rpc('svc_create_group_proposal', {
      p_territory_id: p.territory_id,
      p_name: p.name,
      p_join_url: p.join_url,
      p_proposer_name: p.proposer_name,
      p_proposer_email: p.proposer_email,
      p_proposer_phone: p.proposer_phone,
      p_proposer_user_id: p.proposer_user_id,
      p_consent_version: p.consent_version,
      p_idempotency_hash: p.idempotency_hash,
      p_fingerprint_hash: p.fingerprint_hash,
      p_idempotency_ttl_seconds: p.idempotency_ttl_seconds,
    });
  }

  async patchGroup(id: string, patch: GroupPatch): Promise<GroupRow | null> {
    // A suspended group can only be reactivated through /admin/groups/:id/unsuspend
    // (audited with its own action); a plain PATCH must not revive it.
    const res = await this.db
      .from('whatsapp_groups')
      .update(patch)
      .eq('id', safeUuid(id))
      .neq('status', 'suspended')
      .select(PUBLIC_GROUP_COLS)
      .maybeSingle();
    return check(res, 'patchGroup') as GroupRow | null;
  }

  // ------------------------------------------------------------------ activities
  async listPublicActivities(q: PublicActivityQuery): Promise<PublicActivityRow[]> {
    let query = this.db
      .from('activities_public')
      .select(PUBLIC_ACTIVITY_COLS)
      .gte('starts_at', safeIso(q.from));
    if (q.to) query = query.lte('starts_at', safeIso(q.to));
    if (q.territory_id) {
      // territory or any descendant (ids are hierarchical: mg-<ibge7>-<slug>)
      // municipality ids have a fixed 7-digit code, so the prefix only matches itself and its
      // neighborhoods; neighborhoods have no children -> exact match.
      if (/^mg-\d{7}$/.test(q.territory_id))
        query = query.like('territory_id', `${q.territory_id}%`);
      else if (q.territory_id !== 'mg') query = query.eq('territory_id', q.territory_id);
    }
    if (q.bbox) {
      const [minLon, minLat, maxLon, maxLat] = q.bbox;
      query = query
        .gte('location_lon', minLon)
        .lte('location_lon', maxLon)
        .gte('location_lat', minLat)
        .lte('location_lat', maxLat);
    }
    if (q.cursor) {
      const at = safeIso(q.cursor.at);
      const id = safeUuid(q.cursor.id);
      query = query.or(`starts_at.gt.${at},and(starts_at.eq.${at},id.gt.${id})`);
    }
    const res = await query
      .order('starts_at')
      .order('id')
      .limit(q.limit + 1);
    return check(res, 'listPublicActivities') as PublicActivityRow[];
  }

  async getPublicActivity(id: string): Promise<PublicActivityRow | null> {
    const res = await this.db
      .from('activities_public')
      .select(PUBLIC_ACTIVITY_COLS)
      .eq('id', safeUuid(id))
      .maybeSingle();
    return check(res, 'getPublicActivity') as PublicActivityRow | null;
  }

  async getActivity(id: string): Promise<ActivityRow | null> {
    const res = await this.db
      .from('activities')
      .select(ACTIVITY_COLS)
      .eq('id', safeUuid(id))
      .maybeSingle();
    return check(res, 'getActivity') as ActivityRow | null;
  }

  async createActivity(creatorId: string, a: ActivityWrite): Promise<ActivityRow> {
    const res = await this.db
      .from('activities')
      .insert({
        ...a,
        creator_user_id: creatorId,
        status: 'pending_review',
        timezone: 'America/Sao_Paulo',
      })
      .select(ACTIVITY_COLS)
      .single();
    return check(res, 'createActivity') as ActivityRow;
  }

  async updateActivity(
    id: string,
    expectedVersion: number,
    patch: ActivityUpdate,
  ): Promise<ActivityRow | null> {
    const res = await this.db
      .from('activities')
      .update({ ...patch, version: expectedVersion + 1 })
      .eq('id', safeUuid(id))
      .eq('version', expectedVersion)
      .select(ACTIVITY_COLS)
      .maybeSingle();
    return check(res, 'updateActivity') as ActivityRow | null;
  }

  async listMyActivities(
    creatorId: string,
    limit: number,
    cursor: Cursor | null,
  ): Promise<ActivityRow[]> {
    let query = this.db
      .from('activities')
      .select(ACTIVITY_COLS)
      .eq('creator_user_id', safeUserId(creatorId));
    if (cursor) {
      const at = safeIso(cursor.at);
      const id = safeUuid(cursor.id);
      query = query.or(`created_at.lt.${at},and(created_at.eq.${at},id.lt.${id})`);
    }
    const res = await query
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit + 1);
    return check(res, 'listMyActivities') as ActivityRow[];
  }

  async listActivitiesByStatus(
    status: string,
    limit: number,
    cursor: Cursor | null,
  ): Promise<ActivityRow[]> {
    let query = this.db.from('activities').select(ACTIVITY_COLS).eq('status', status);
    if (cursor) {
      const at = safeIso(cursor.at);
      const id = safeUuid(cursor.id);
      query = query.or(`created_at.lt.${at},and(created_at.eq.${at},id.lt.${id})`);
    }
    const res = await query
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit + 1);
    return check(res, 'listActivitiesByStatus') as ActivityRow[];
  }

  async rsvpCounts(ids: string[]): Promise<Record<string, number>> {
    if (ids.length === 0) return {};
    const res = await this.db
      .from('activities_public')
      .select('id,rsvp_count')
      .in('id', ids.map(safeUuid));
    const rows = check(res, 'rsvpCounts') as { id: string; rsvp_count: number | null }[];
    return Object.fromEntries(rows.map((r) => [r.id, r.rsvp_count ?? 0]));
  }

  async upsertRsvp(
    activityId: string,
    identity: RsvpIdentity,
    going: boolean,
    idempotencyHash: string | null,
  ): Promise<{ going: boolean; rsvp_count: number }> {
    return this.rpc('svc_upsert_rsvp', {
      p_activity: activityId,
      p_user: 'user_id' in identity ? identity.user_id : null,
      p_subject_hash: 'subject_hash' in identity ? identity.subject_hash : null,
      p_going: going,
      p_idempotency_hash: idempotencyHash,
    });
  }

  // ------------------------------------------------------------------ profiles / identity
  async getProfile(userId: string): Promise<ProfileRow | null> {
    return this.rpc<ProfileRow | null>('svc_get_profile', { p_user: userId });
  }

  async createProfile(p: NewProfile): Promise<{ created: boolean; profile: ProfileRow }> {
    return this.rpc('svc_create_profile', {
      p_user_id: p.user_id,
      p_display_name: p.display_name,
      p_email: p.email,
      p_phone: p.phone,
      p_territory_id: p.territory_id,
      p_consent_version: p.consent_version,
      p_contact_opt_in: p.contact_opt_in,
      p_email_state: p.email_state,
    });
  }

  async deleteProfile(userId: string): Promise<void> {
    await this.rpc('svc_delete_profile', { p_user: userId });
  }

  async updateProfile(userId: string, patch: ProfilePatch): Promise<ProfileRow | null> {
    return this.rpc<ProfileRow | null>('svc_update_profile', {
      p_user: userId,
      p_display_name: patch.display_name ?? null,
      p_territory_id: patch.selected_territory_id ?? null,
      p_contact_opt_in: patch.contact_opt_in ?? null,
      p_email_state: patch.email_state ?? null,
      p_phone: patch.phone ?? null,
      p_email_contact: patch.email_contact ?? null,
    });
  }

  emailInUse(email: string, excludeUserId: string): Promise<boolean> {
    return this.rpc('svc_email_in_use', { p_email: email, p_exclude: excludeUserId });
  }

  isAdmin(userId: string): Promise<boolean> {
    return this.rpc('svc_is_admin', { p_user: userId });
  }

  isEmailVerified(userId: string): Promise<boolean> {
    return this.rpc('svc_is_email_verified', { p_user: userId });
  }

  // ------------------------------------------------------------------ moderation
  listGroupProposals(
    status: string | null,
    limit: number,
    cursor: Cursor | null,
  ): Promise<GroupProposalRow[]> {
    return this.rpc('svc_list_group_proposals', {
      p_status: status,
      p_limit: limit + 1,
      p_cursor_created: cursor?.at ?? null,
      p_cursor_id: cursor?.id ?? null,
    });
  }

  approveGroupProposal(
    id: string,
    adminId: string,
    reason: string,
    requestId: string,
  ): Promise<{ group_id: string; territory_id: string }> {
    return this.rpc('svc_approve_group_proposal', {
      p_id: id,
      p_admin: adminId,
      p_reason: reason,
      p_request_id: requestId,
    });
  }

  async rejectGroupProposal(
    id: string,
    adminId: string,
    reason: string,
    requestId: string,
  ): Promise<{ territory_id: string }> {
    return this.rpc('svc_reject_group_proposal', {
      p_id: id,
      p_admin: adminId,
      p_reason: reason,
      p_request_id: requestId,
    });
  }

  approveActivity(
    id: string,
    adminId: string,
    reason: string | null,
    requestId: string,
  ): Promise<number> {
    return this.rpc('svc_approve_activity', {
      p_id: id,
      p_admin: adminId,
      p_reason: reason,
      p_request_id: requestId,
    });
  }

  rejectActivity(id: string, adminId: string, reason: string, requestId: string): Promise<number> {
    return this.rpc('svc_reject_activity', {
      p_id: id,
      p_admin: adminId,
      p_reason: reason,
      p_request_id: requestId,
    });
  }

  addGroupManager(m: NewGroupManager, adminId: string, requestId: string): Promise<string> {
    return this.rpc('svc_add_group_manager', {
      p_group_id: m.group_id,
      p_name: m.name,
      p_email: m.email,
      p_phone: m.phone,
      p_role_label: m.role_label,
      p_admin: adminId,
      p_request_id: requestId,
    });
  }

  setGroupSuspension(
    id: string,
    adminId: string,
    reason: string,
    requestId: string,
    suspend: boolean,
  ): Promise<GroupStatusRow> {
    return this.rpc(suspend ? 'svc_suspend_group' : 'svc_unsuspend_group', {
      p_id: id,
      p_admin: adminId,
      p_reason: reason,
      p_request_id: requestId,
    });
  }

  async setActivitySuspension(
    id: string,
    adminId: string,
    reason: string,
    requestId: string,
    suspend: boolean,
  ): Promise<{ version: number; status: ActivityStatus }> {
    const args = { p_id: id, p_admin: adminId, p_reason: reason, p_request_id: requestId };
    if (suspend) {
      const version = await this.rpc<number>('svc_suspend_activity', args);
      return { version, status: 'suspended' };
    }
    return this.rpc('svc_unsuspend_activity', args);
  }

  revealProposalContact(
    id: string,
    adminId: string,
    requestId: string,
    reason: string | null,
  ): Promise<RevealedContact> {
    return this.rpc('svc_reveal_proposal_contact', {
      p_id: id,
      p_admin: adminId,
      p_request_id: requestId,
      p_reason: reason,
    });
  }

  // ------------------------------------------------------------------ audit / abuse / turnstile
  async recordAudit(e: {
    actor: string | null;
    action: string;
    entity_type: string;
    entity_id: string | null;
    request_id: string;
    reason?: string | null;
  }): Promise<void> {
    await this.rpc('svc_record_audit', {
      p_actor: e.actor,
      p_action: e.action,
      p_entity_type: e.entity_type,
      p_entity_id: e.entity_id,
      p_request_id: e.request_id,
      p_reason: e.reason ?? null,
    });
  }

  async recordAbuse(e: {
    subject_hash: string | null;
    route: string;
    event_type: string;
    block_code: string | null;
  }): Promise<void> {
    await this.rpc('svc_record_abuse', {
      p_subject_hash: e.subject_hash,
      p_route: e.route,
      p_event_type: e.event_type,
      p_block_code: e.block_code,
    });
  }

  listSecurityEvents(limit: number, cursor: Cursor | null): Promise<SecurityEventRow[]> {
    return this.rpc('svc_list_security_events', {
      p_limit: limit + 1,
      p_cursor_created: cursor?.at ?? null,
      p_cursor_id: cursor?.id ?? null,
    });
  }

  consumeTurnstileToken(tokenHash: string, ttlSeconds: number): Promise<boolean> {
    return this.rpc('svc_consume_turnstile_token', {
      p_hash: tokenHash,
      p_ttl_seconds: ttlSeconds,
    });
  }
}
