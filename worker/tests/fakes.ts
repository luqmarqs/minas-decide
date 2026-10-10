/**
 * In-memory fakes for Worker tests. FakeRepo mirrors the SQL semantics of migrations
 * 0005–0007 (conditional moderation updates, idempotent RSVP/proposals, public projections)
 * so route logic can be exercised with app.request(). These are NOT a substitute for the
 * real RLS tests in supabase/tests (which run against the TARGET dev project).
 */
import type { AdminInternalMetrics, AdminRegistration } from '../../shared/contracts/admin.ts';
import { createApp } from '../app.ts';
import type { AuthUser, Deps, EdgeCache, Env } from '../env.ts';
import { fail } from '../errors.ts';
import { SlidingWindowLimiter } from '../middleware/rate-limit.ts';
import { UserInfoCache } from '../services/user-cache.ts';
import type {
  ActivityRow,
  ActivityUpdate,
  ActivityWrite,
  AuthGateway,
  Cursor,
  GroupPatch,
  GroupProposalRow,
  GroupRow,
  GroupStatusRow,
  ClerkUserInfo,
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
  VerifiedSession,
} from '../repositories/types.ts';
import type { SiteverifyResult, TurnstileVerifier } from '../services/turnstile.ts';

const iso = (ms: number) => new Date(ms).toISOString();

function territory(
  id: string,
  type: TerritoryRow['type'],
  name: string,
  parent: string | null,
  muni: string | null,
): TerritoryRow {
  return {
    id,
    type,
    name,
    normalized_name: name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(),
    slug: id.split('-').pop() ?? id,
    parent_id: parent,
    ibge_code: /^mg-(\d{7})/.exec(id)?.[1] ?? null,
    municipality_name: muni,
    centroid_lon: -43.4,
    centroid_lat: -20.3,
    data_quality: 'demo',
  };
}

interface Rsvp {
  activity_id: string;
  user_id: string | null;
  subject_hash: string | null;
  status: 'going' | 'cancelled';
}

interface StoredProposal extends GroupProposalRow {
  idempotency_hash: string | null;
  idempotency_expires_at: number | null;
  fingerprint_hash: string | null;
}

export class FakeRepo implements Repo {
  territories: TerritoryRow[] = [
    territory('mg', 'state', 'Minas Gerais', null, null),
    territory('mg-3140001', 'municipality', 'Mariana', 'mg', 'Mariana'),
    territory('mg-3140001-centro', 'neighborhood', 'Centro', 'mg-3140001', 'Mariana'),
    territory('mg-3106200', 'municipality', 'Belo Horizonte', 'mg', 'Belo Horizonte'),
    territory('mg-3106200-centro', 'neighborhood', 'Centro', 'mg-3106200', 'Belo Horizonte'),
  ];
  groups: (GroupRow & {
    managers: NewGroupManager[];
    source_proposal_id: string | null;
    status_before_suspension?: GroupRow['status'] | null;
  })[] = [];
  proposals: StoredProposal[] = [];
  activities: (ActivityRow & { status_before_suspension?: ActivityRow['status'] | null })[] = [];
  rsvps: Rsvp[] = [];
  profiles = new Map<string, ProfileRow>();
  admins = new Set<string>();
  adminMeta = new Map<string, { created_at: string; created_by: string | null }>();
  /** user ids passed to eraseUserData (webhook tests) */
  erased: string[] = [];
  verified = new Set<string>();
  audit: {
    actor: string | null;
    action: string;
    entity_id: string | null;
    reason?: string | null;
  }[] = [];
  abuse: SecurityEventRow[] = [];
  usedTokens = new Set<string>();
  private seq = 0;

  constructor(private readonly clock: () => number) {}

  uuid(): string {
    this.seq += 1;
    return `00000000-0000-4000-8000-${this.seq.toString(16).padStart(12, '0')}`;
  }

  // ---------------------------------------------------------------- territories
  async searchTerritories(q: string, limit: number) {
    return this.territories
      .filter((t) => t.type !== 'state' && t.normalized_name.includes(q))
      .slice(0, limit * 4);
  }
  async getTerritories(ids: string[]) {
    return this.territories.filter((t) => ids.includes(t.id));
  }
  async countChildren(id: string) {
    return this.territories.filter((t) => t.parent_id === id).length;
  }
  async listChildIds(id: string) {
    return this.territories.filter((t) => t.parent_id === id).map((t) => t.id);
  }

  // ---------------------------------------------------------------- groups
  async listActiveGroups(territoryId: string): Promise<PublicGroupRow[]> {
    return this.groups
      .filter((g) => g.territory_id === territoryId && g.status === 'active')
      .map((g) => ({
        id: g.id,
        display_name: g.display_name,
        territory_id: g.territory_id,
        join_url: g.join_url,
        status: 'active' as const,
        updated_at: g.updated_at,
      }));
  }
  addGroup(territoryId: string, status: GroupRow['status'] = 'active'): GroupRow {
    const g = {
      id: this.uuid(),
      display_name: `Grupo ${territoryId}`,
      territory_id: territoryId,
      join_url: `https://chat.whatsapp.com/AbCdEfGhIjK${this.seq}`,
      status,
      updated_at: iso(this.clock()),
      managers: [],
      source_proposal_id: null,
    };
    this.groups.push(g);
    return g;
  }
  /** Mirrors svc_create_group_proposal (0010): only a pending, non-expired holder dedupes. */
  async createGroupProposal(p: NewGroupProposal) {
    const now = this.clock();
    const existing = this.proposals.find((x) => x.idempotency_hash === p.idempotency_hash);
    if (existing && existing.status === 'pending' && (existing.idempotency_expires_at ?? 0) > now)
      return { id: existing.id, status: 'pending', created: false };
    if (existing) {
      existing.idempotency_hash = null;
      existing.idempotency_expires_at = null;
    }
    const row: StoredProposal = {
      id: this.uuid(),
      territory_id: p.territory_id,
      name_proposed: p.name,
      join_url_proposed: p.join_url,
      proposer_name: p.proposer_name,
      proposer_email: p.proposer_email,
      proposer_phone: p.proposer_phone,
      status: 'pending',
      created_at: iso(this.clock()),
      reviewed_at: null,
      review_reason: null,
      idempotency_hash: p.idempotency_hash,
      idempotency_expires_at: now + p.idempotency_ttl_seconds * 1000,
      fingerprint_hash: p.fingerprint_hash,
      group_id: null,
    };
    this.proposals.push(row);
    return { id: row.id, status: 'pending', created: true };
  }
  async patchGroup(id: string, patch: GroupPatch) {
    const g = this.groups.find((x) => x.id === id);
    if (!g || g.status === 'suspended') return null; // PATCH never revives a suspended group
    Object.assign(g, patch, { updated_at: iso(this.clock()) });
    return g;
  }

  // ---------------------------------------------------------------- activities
  private count(id: string) {
    return this.rsvps.filter((r) => r.activity_id === id && r.status === 'going').length;
  }
  private toPublic(a: ActivityRow): PublicActivityRow {
    return {
      id: a.id,
      title: a.title,
      type: a.type,
      description_sanitized: a.description_sanitized,
      starts_at: a.starts_at,
      ends_at: a.ends_at,
      timezone: a.timezone,
      location_public: a.public_address,
      location_lon: a.location_lon,
      location_lat: a.location_lat,
      territory_id: a.territory_id,
      status: a.status as 'published' | 'cancelled',
      contact_public_type: a.public_contact_opt_in ? a.public_contact_type : null,
      contact_public_value: a.public_contact_opt_in ? a.public_contact_value : null,
      rsvp_count: this.count(a.id),
      updated_at: a.updated_at,
    };
  }
  async listPublicActivities(q: PublicActivityQuery) {
    return this.activities
      .filter((a) => a.status === 'published' || a.status === 'cancelled')
      .filter((a) => a.starts_at >= q.from && (!q.to || a.starts_at <= q.to))
      .filter(
        (a) =>
          !q.territory_id || q.territory_id === 'mg' || a.territory_id.startsWith(q.territory_id),
      )
      .filter(
        (a) =>
          !q.bbox ||
          (a.location_lon >= q.bbox[0] &&
            a.location_lon <= q.bbox[2] &&
            a.location_lat >= q.bbox[1] &&
            a.location_lat <= q.bbox[3]),
      )
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at) || a.id.localeCompare(b.id))
      .filter(
        (a) =>
          !q.cursor ||
          a.starts_at > q.cursor.at ||
          (a.starts_at === q.cursor.at && a.id > q.cursor.id),
      )
      .slice(0, q.limit + 1)
      .map((a) => this.toPublic(a));
  }
  async getPublicActivity(id: string) {
    const a = this.activities.find(
      (x) => x.id === id && (x.status === 'published' || x.status === 'cancelled'),
    );
    return a ? this.toPublic(a) : null;
  }
  async getActivity(id: string) {
    return this.activities.find((x) => x.id === id) ?? null;
  }
  async createActivity(creatorId: string, w: ActivityWrite) {
    const now = iso(this.clock());
    const row: ActivityRow = {
      ...w,
      id: this.uuid(),
      creator_user_id: creatorId,
      timezone: 'America/Sao_Paulo',
      status: 'pending_review',
      contact_public_type: w.public_contact_opt_in ? w.public_contact_type : null,
      contact_public_value: w.public_contact_opt_in ? w.public_contact_value : null,
      reviewed_at: null,
      review_reason: null,
      version: 1,
      created_at: now,
      updated_at: now,
    };
    this.activities.push(row);
    return row;
  }
  async updateActivity(id: string, expectedVersion: number, patch: ActivityUpdate) {
    const a = this.activities.find((x) => x.id === id && x.version === expectedVersion);
    if (!a) return null;
    const { cancelled_at: _ignored, ...rest } = patch;
    Object.assign(a, rest, { version: expectedVersion + 1, updated_at: iso(this.clock()) });
    a.contact_public_type = a.public_contact_opt_in ? a.public_contact_type : null;
    a.contact_public_value = a.public_contact_opt_in ? a.public_contact_value : null;
    return a;
  }
  async listMyActivities(creatorId: string, limit: number, _cursor: Cursor | null) {
    return this.activities.filter((a) => a.creator_user_id === creatorId).slice(0, limit + 1);
  }
  async listActivitiesByStatus(status: string, limit: number, _cursor: Cursor | null) {
    return this.activities.filter((a) => a.status === status).slice(0, limit + 1);
  }
  async rsvpCounts(ids: string[]) {
    return Object.fromEntries(ids.map((id) => [id, this.count(id)]));
  }
  async upsertRsvp(activityId: string, who: RsvpIdentity, going: boolean, _idem: string | null) {
    const a = this.activities.find((x) => x.id === activityId);
    if (!a || (a.status !== 'published' && a.status !== 'cancelled')) throw fail('NOT_FOUND');
    const match = (r: Rsvp) =>
      r.activity_id === activityId &&
      ('user_id' in who ? r.user_id === who.user_id : r.subject_hash === who.subject_hash);
    const existing = this.rsvps.find(match);
    if (going) {
      if (a.status !== 'published') throw fail('CONFLICT');
      if (existing) existing.status = 'going';
      else
        this.rsvps.push({
          activity_id: activityId,
          user_id: 'user_id' in who ? who.user_id : null,
          subject_hash: 'subject_hash' in who ? who.subject_hash : null,
          status: 'going',
        });
    } else {
      if (!existing) throw fail('NOT_FOUND');
      existing.status = 'cancelled';
    }
    return { going, rsvp_count: this.count(activityId) };
  }

  // ---------------------------------------------------------------- profiles
  async getProfile(id: string) {
    return this.profiles.get(id) ?? null;
  }
  async createProfile(p: NewProfile) {
    const existing = this.profiles.get(p.user_id);
    if (existing) return { created: false, profile: existing };
    const now = iso(this.clock());
    const row: ProfileRow = {
      user_id: p.user_id,
      display_name: p.display_name,
      email_contact: p.email,
      email_verification_state: p.email_state,
      phone_e164: p.phone,
      selected_territory_id: p.territory_id,
      consent_version: p.consent_version,
      contact_opt_in_at: p.contact_opt_in ? now : null,
      account_state: 'active',
      review_required_at: null,
      created_at: now,
      updated_at: now,
    };
    this.profiles.set(p.user_id, row);
    return { created: true, profile: row };
  }
  async deleteProfile(id: string) {
    this.profiles.delete(id);
  }
  /** Mirrors svc_erase_user_data (0012). */
  async eraseUserData(id: string, _requestId: string) {
    if (!/^user_[A-Za-z0-9]{1,64}$/.test(id)) throw fail('VALIDATION_ERROR');
    const own = new Set(this.activities.filter((a) => a.creator_user_id === id).map((a) => a.id));
    const rsvpsBefore = this.rsvps.length;
    this.rsvps = this.rsvps.filter((r) => r.user_id !== id && !own.has(r.activity_id));
    const activitiesBefore = this.activities.length;
    this.activities = this.activities.filter((a) => a.creator_user_id !== id);
    const profiles = this.profiles.delete(id) ? 1 : 0;
    const admins = this.admins.delete(id) ? 1 : 0;
    this.verified.delete(id);
    this.erased.push(id);
    return {
      rsvps: rsvpsBefore - this.rsvps.length,
      activities: activitiesBefore - this.activities.length,
      profiles,
      admins,
    };
  }
  async updateProfile(id: string, patch: ProfilePatch) {
    const p = this.profiles.get(id);
    if (!p) return null;
    if (patch.display_name !== undefined) p.display_name = patch.display_name;
    if (patch.selected_territory_id !== undefined)
      p.selected_territory_id = patch.selected_territory_id;
    if (patch.email_state !== undefined) p.email_verification_state = patch.email_state;
    if (patch.contact_opt_in !== undefined)
      p.contact_opt_in_at = patch.contact_opt_in ? iso(this.clock()) : null;
    if (patch.phone !== undefined) p.phone_e164 = patch.phone;
    if (patch.email_contact !== undefined) p.email_contact = patch.email_contact;
    return p;
  }
  /** Mirrors app_private.email_in_use (0012): another PROFILE holds this contact e-mail. */
  async emailInUse(email: string, exclude: string) {
    const lower = email.toLowerCase();
    return [...this.profiles.values()].some(
      (p) => p.user_id !== exclude && p.email_contact.toLowerCase() === lower,
    );
  }
  async isAdmin(id: string) {
    return this.admins.has(id);
  }
  async listAdmins() {
    return [...this.admins].map((user_id) => ({
      user_id,
      created_at: this.adminMeta.get(user_id)?.created_at ?? new Date(this.clock()).toISOString(),
      created_by: this.adminMeta.get(user_id)?.created_by ?? null,
    }));
  }
  async addAdmin(id: string, actor: string) {
    if (this.admins.has(id)) return false;
    this.admins.add(id);
    this.adminMeta.set(id, { created_at: new Date(this.clock()).toISOString(), created_by: actor });
    return true;
  }
  async removeAdmin(id: string, _actor: string) {
    if (!this.admins.has(id)) return false;
    if (this.admins.size <= 1) throw fail('CONFLICT');
    this.adminMeta.delete(id);
    return this.admins.delete(id);
  }
  /** listProfiles calls (route tests): limit and whether a cursor was sent. */
  listProfilesCalls: { limit: number; after: Cursor | null; q: string | null }[] = [];
  /** make the Nth (1-based) listProfiles call throw (stream failure tests) */
  failListProfilesAt: number | null = null;
  private matchProfile(p: ProfileRow, q: string | null): boolean {
    if (!q) return true;
    const needle = q.toLowerCase();
    const terr = this.territories.find((t) => t.id === p.selected_territory_id)?.name ?? '';
    return [p.display_name, p.email_contact, terr].some((v) => v.toLowerCase().includes(needle));
  }
  private registration(p: ProfileRow): AdminRegistration {
    return {
      user_id: p.user_id,
      display_name: p.display_name,
      email: p.email_contact,
      phone: p.phone_e164,
      territory_id: p.selected_territory_id,
      territory_name: this.territories.find((t) => t.id === p.selected_territory_id)?.name ?? null,
      contact_opt_in: p.contact_opt_in_at !== null,
      consent_version: p.consent_version,
      email_verification_state: p.email_verification_state,
      account_state: p.account_state,
      created_at: p.created_at,
    };
  }
  /** Mirrors svc_list_profiles (0016): keyset (created_at desc, user_id desc), limit 1..1000. */
  async listProfiles(opts: { after: Cursor | null; limit: number; q: string | null }) {
    this.listProfilesCalls.push({ limit: opts.limit, after: opts.after, q: opts.q });
    if (this.failListProfilesAt === this.listProfilesCalls.length) throw new Error('db down');
    const limit = Math.min(Math.max(opts.limit, 1), 1000);
    const rows = [...this.profiles.values()]
      .filter((p) => this.matchProfile(p, opts.q))
      .sort((a, b) =>
        a.created_at === b.created_at
          ? a.user_id < b.user_id
            ? 1
            : -1
          : a.created_at < b.created_at
            ? 1
            : -1,
      )
      .filter(
        (p) =>
          !opts.after ||
          p.created_at < opts.after.at ||
          (p.created_at === opts.after.at && p.user_id < opts.after.id),
      );
    return rows.slice(0, limit).map((p) => this.registration(p));
  }
  async countProfiles(q: string | null) {
    return [...this.profiles.values()].filter((p) => this.matchProfile(p, q)).length;
  }
  /** `days` values passed to adminMetrics (route tests). */
  metricsCalls: number[] = [];
  /** Mirrors svc_admin_metrics (0015) over the in-memory state; aggregates only. */
  async adminMetrics(days: number): Promise<AdminInternalMetrics> {
    this.metricsCalls.push(days);
    const now = this.clock();
    const profiles = [...this.profiles.values()];
    const since = (d: number) =>
      profiles.filter((p) => Date.parse(p.created_at) >= now - d * 864e5);
    const by_day = Array.from({ length: days }, (_, i) => {
      const day = new Date(now - (days - 1 - i) * 864e5 - 3 * 36e5).toISOString().slice(0, 10);
      return {
        day,
        count: profiles.filter(
          (p) => new Date(Date.parse(p.created_at) - 3 * 36e5).toISOString().slice(0, 10) === day,
        ).length,
      };
    });
    const by_status: Record<string, number> = Object.fromEntries(
      [
        'draft',
        'pending_review',
        'published',
        'rejected',
        'cancelled',
        'archived',
        'suspended',
      ].map((s) => [s, this.activities.filter((a) => a.status === s).length]),
    );
    const perTerritory = new Map<string, number>();
    for (const p of profiles) {
      if (p.selected_territory_id) {
        perTerritory.set(
          p.selected_territory_id,
          (perTerritory.get(p.selected_territory_id) ?? 0) + 1,
        );
      }
    }
    const going = this.rsvps.filter((r) => r.status === 'going');
    return {
      profiles: {
        total: profiles.length,
        last_7d: since(7).length,
        last_30d: since(30).length,
        by_day,
      },
      activities: {
        by_status,
        upcoming_published: this.activities.filter(
          (a) => a.status === 'published' && Date.parse(a.starts_at) > now,
        ).length,
      },
      rsvps: { total: going.length, last_7d: 0 },
      groups: {
        active: this.groups.filter((g) => g.status === 'active').length,
        suspended: this.groups.filter((g) => g.status === 'suspended').length,
        pending_proposals: this.proposals.filter((p) => p.status === 'pending').length,
      },
      admins: { total: this.admins.size },
      top_territories: [...perTerritory]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([territory_id, registrations]) => ({
          territory_id,
          name: this.territories.find((t) => t.id === territory_id)?.name ?? territory_id,
          registrations,
        })),
    };
  }
  async isEmailVerified(id: string) {
    return this.verified.has(id);
  }

  // ---------------------------------------------------------------- moderation
  async listGroupProposals(status: string | null, limit: number) {
    return this.proposals.filter((p) => !status || p.status === status).slice(0, limit + 1);
  }
  async approveGroupProposal(id: string, adminId: string, reason: string) {
    if (!this.admins.has(adminId)) throw fail('FORBIDDEN');
    const p = this.proposals.find((x) => x.id === id);
    if (!p) throw fail('NOT_FOUND');
    if (p.status !== 'pending') throw fail('CONFLICT');
    p.status = 'active';
    p.reviewed_at = iso(this.clock());
    p.review_reason = reason;
    const g = this.addGroup(p.territory_id);
    Object.assign(g, { join_url: p.join_url_proposed, display_name: p.name_proposed });
    p.group_id = g.id;
    this.audit.push({ actor: adminId, action: 'group_proposal.approve', entity_id: id });
    return { group_id: g.id, territory_id: g.territory_id };
  }
  async rejectGroupProposal(id: string, adminId: string, reason: string) {
    if (!this.admins.has(adminId)) throw fail('FORBIDDEN');
    const p = this.proposals.find((x) => x.id === id);
    if (!p) throw fail('NOT_FOUND');
    if (p.status !== 'pending') throw fail('CONFLICT');
    p.status = 'rejected';
    p.review_reason = reason;
    this.audit.push({ actor: adminId, action: 'group_proposal.reject', entity_id: id });
    return { territory_id: p.territory_id };
  }
  private moderate(
    id: string,
    adminId: string,
    to: 'published' | 'rejected',
    reason: string | null,
  ) {
    if (!this.admins.has(adminId)) throw fail('FORBIDDEN');
    const a = this.activities.find((x) => x.id === id);
    if (!a) throw fail('NOT_FOUND');
    if (a.status !== 'pending_review') throw fail('CONFLICT');
    a.status = to;
    a.review_reason = reason;
    a.version += 1;
    this.audit.push({ actor: adminId, action: `activity.${to}`, entity_id: id });
    return a.version;
  }
  async approveActivity(id: string, adminId: string, reason: string | null) {
    return this.moderate(id, adminId, 'published', reason);
  }
  async rejectActivity(id: string, adminId: string, reason: string) {
    return this.moderate(id, adminId, 'rejected', reason);
  }
  async addGroupManager(m: NewGroupManager, adminId: string) {
    if (!this.admins.has(adminId)) throw fail('FORBIDDEN');
    const g = this.groups.find((x) => x.id === m.group_id);
    if (!g) throw fail('NOT_FOUND');
    g.managers.push(m);
    return this.uuid();
  }

  async setGroupSuspension(
    id: string,
    adminId: string,
    reason: string,
    _requestId: string,
    suspend: boolean,
  ): Promise<GroupStatusRow> {
    if (!this.admins.has(adminId)) throw fail('FORBIDDEN');
    const g = this.groups.find((x) => x.id === id);
    if (!g) throw fail('NOT_FOUND');
    const allowed = suspend ? ['active', 'inactive'] : ['suspended'];
    if (!allowed.includes(g.status)) throw fail('CONFLICT');
    if (suspend) {
      g.status_before_suspension = g.status;
      g.status = 'suspended';
    } else {
      g.status = g.status_before_suspension === 'inactive' ? 'inactive' : 'active';
      g.status_before_suspension = null;
    }
    g.updated_at = iso(this.clock());
    this.audit.push({
      actor: adminId,
      action: suspend ? 'group.suspend' : 'group.unsuspend',
      entity_id: id,
      reason,
    });
    return { id: g.id, territory_id: g.territory_id, status: g.status, updated_at: g.updated_at };
  }
  async setActivitySuspension(
    id: string,
    adminId: string,
    reason: string,
    _requestId: string,
    suspend: boolean,
  ): Promise<{ version: number; status: ActivityRow['status'] }> {
    if (!this.admins.has(adminId)) throw fail('FORBIDDEN');
    const a = this.activities.find((x) => x.id === id);
    if (!a) throw fail('NOT_FOUND');
    const allowed = suspend ? ['draft', 'pending_review', 'published', 'cancelled'] : ['suspended'];
    if (!allowed.includes(a.status)) throw fail('CONFLICT');
    if (suspend) {
      a.status_before_suspension = a.status;
      a.status = 'suspended';
    } else {
      a.status = a.status_before_suspension === 'cancelled' ? 'cancelled' : 'pending_review';
      a.status_before_suspension = null;
    }
    a.review_reason = reason;
    a.version += 1;
    this.audit.push({
      actor: adminId,
      action: suspend ? 'activity.suspend' : 'activity.unsuspend',
      entity_id: id,
      reason,
    });
    return { version: a.version, status: a.status };
  }
  async revealProposalContact(
    id: string,
    adminId: string,
    _requestId: string,
    reason: string | null,
  ): Promise<RevealedContact> {
    if (!this.admins.has(adminId)) throw fail('FORBIDDEN');
    const p = this.proposals.find((x) => x.id === id);
    if (!p) throw fail('NOT_FOUND');
    this.audit.push({ actor: adminId, action: 'proposal.reveal_contact', entity_id: id, reason });
    return {
      proposal_id: p.id,
      proposer_email: p.proposer_email,
      proposer_phone: p.proposer_phone,
      revealed_at: iso(this.clock()),
    };
  }

  // ---------------------------------------------------------------- audit / abuse / turnstile
  async recordAudit(e: {
    actor: string | null;
    action: string;
    entity_id: string | null;
    reason?: string | null;
  }) {
    this.audit.push({
      actor: e.actor,
      action: e.action,
      entity_id: e.entity_id,
      reason: e.reason ?? null,
    });
  }
  async recordAbuse(e: {
    subject_hash: string | null;
    route: string;
    event_type: string;
    block_code: string | null;
  }) {
    this.abuse.push({
      id: this.uuid(),
      created_at: iso(this.clock()),
      route: e.route,
      event_type: e.event_type,
      block_code: e.block_code,
    });
  }
  async listSecurityEvents(limit: number) {
    return this.abuse.slice(0, limit + 1);
  }
  async consumeTurnstileToken(hash: string) {
    if (this.usedTokens.has(hash)) return false;
    this.usedTokens.add(hash);
    return true;
  }

  /** Test helper: a published activity owned by `creator`. */
  seedActivity(creator: string, over: Partial<ActivityRow> = {}): ActivityRow {
    const now = this.clock();
    const row: ActivityRow = {
      id: this.uuid(),
      creator_user_id: creator,
      territory_id: 'mg-3140001-centro',
      title: 'Panfletagem no centro',
      type: 'panfletagem',
      description: 'Descrição pública da atividade',
      description_sanitized: 'Descrição pública da atividade',
      starts_at: iso(now + 86_400_000),
      ends_at: null,
      timezone: 'America/Sao_Paulo',
      public_address: 'Praça Gomes Freire',
      location_lon: -43.41,
      location_lat: -20.38,
      status: 'published',
      public_contact_opt_in: true,
      public_contact_type: 'instagram',
      public_contact_value: '@organizador',
      contact_public_type: 'instagram',
      contact_public_value: '@organizador',
      reviewed_at: null,
      review_reason: 'nota interna de moderação',
      version: 1,
      created_at: iso(now),
      updated_at: iso(now),
      ...over,
    };
    this.activities.push(row);
    return row;
  }
}

/**
 * Fake Clerk gateway: `verify` stands in for `verifyToken` (JWKS) and `getUser` for the Backend
 * API. Tokens map to sessions; people map Clerk ids to their primary e-mail state.
 */
export class FakeAuth implements AuthGateway {
  sessions = new Map<string, VerifiedSession>(); // token -> verified session
  people = new Map<string, ClerkUserInfo>(); // clerk id -> user
  verifyCalls = 0;
  getUserCalls = 0;
  /** simulate a Clerk Backend API outage */
  outage = false;
  /** simulate a JWKS/network failure while verifying the token */
  verifyOutage = false;

  add(
    token: string,
    user: Partial<AuthUser> & { id: string },
    opts: { claims?: Record<string, unknown>; banned?: boolean } = {},
  ): AuthUser {
    const u: AuthUser = {
      email: null,
      email_confirmed: false,
      ...user,
      is_anonymous: false,
    };
    this.sessions.set(token, { sub: u.id, claims: { sub: u.id, sts: 'active', ...opts.claims } });
    this.people.set(u.id, {
      id: u.id,
      email: u.email,
      email_verified: u.email_confirmed,
      banned: opts.banned ?? false,
    });
    return u;
  }
  async verify(token: string) {
    this.verifyCalls += 1;
    if (this.verifyOutage) throw fail('SERVICE_UNAVAILABLE'); // JWKS/network failure (QA3-05)
    return this.sessions.get(token) ?? null;
  }
  async getUser(id: string) {
    this.getUserCalls += 1;
    if (this.outage) throw fail('SERVICE_UNAVAILABLE'); // ClerkAuthGateway maps 429/5xx/network
    return this.people.get(id) ?? null;
  }
  async findUserByEmail(email: string) {
    return [...this.people.values()].find((p) => p.email === email.toLowerCase()) ?? null;
  }
}

/** Fake Siteverify: tokens starting with "bad" fail; "wronghost" returns another hostname;
 *  "tok-no-action" returns action=null; otherwise the expected action is echoed (as a real
 *  widget rendered with `data-action` would). */
export class FakeTurnstile implements TurnstileVerifier {
  calls = 0;
  async verify({
    token,
    expectedAction,
  }: {
    token: string;
    expectedAction?: string | null;
  }): Promise<SiteverifyResult> {
    this.calls += 1;
    if (token.startsWith('bad'))
      return {
        success: false,
        hostname: null,
        action: null,
        errorCodes: ['invalid-input-response'],
      };
    return {
      success: true,
      hostname: token.startsWith('wronghost') ? 'evil.example' : 'localhost',
      action: token.startsWith('tok-no-action') ? null : (expectedAction ?? null),
      errorCodes: [],
    };
  }
}

export function testEnv(over: Partial<Env> = {}): Env {
  return {
    APP_ENV: 'test',
    WRITES_ENABLED: 'true',
    PUBLIC_ORIGIN: 'http://127.0.0.1:8787',
    TURNSTILE_EXPECTED_HOSTNAMES: 'localhost,127.0.0.1',
    SUPABASE_TARGET_URL: 'http://supabase.invalid',
    CLERK_SECRET_KEY:
      over.APP_ENV === 'production'
        ? 'sk_live_placeholderplaceholder'
        : 'sk_test_placeholderplaceholder',
    SUPABASE_TARGET_SERVICE_ROLE_KEY: 'service-placeholder',
    TURNSTILE_SECRET_KEY: 'non-test-secret-placeholder',
    RSVP_DEVICE_SECRET: 'device-secret-placeholder-0123456789',
    CLERK_ISSUER: 'https://test-instance.clerk.accounts.dev',
    ...over,
  };
}

/** In-memory Cache API stand-in (keyed by URL) for edge-cache tests. */
export class FakeEdgeCache implements EdgeCache {
  store = new Map<string, Response>();
  puts = 0;
  deletes: string[] = [];
  async match(req: Request) {
    const r = this.store.get(req.url);
    return r ? r.clone() : undefined;
  }
  async put(req: Request, res: Response) {
    this.puts += 1;
    this.store.set(req.url, res);
  }
  async delete(req: Request) {
    this.deletes.push(req.url);
    return this.store.delete(req.url);
  }
}

export function setup(envOver: Partial<Env> = {}, opts: { edgeCache?: boolean } = {}) {
  let now = Date.parse('2026-10-08T12:00:00Z');
  const clock = () => now;
  const repo = new FakeRepo(clock);
  const auth = new FakeAuth();
  const turnstile = new FakeTurnstile();
  const limiter = new SlidingWindowLimiter();
  const edgeCache = opts.edgeCache ? new FakeEdgeCache() : null;
  const userCache = new UserInfoCache();
  const deps: Deps = { repo, auth, turnstile, limiter, userCache, now: clock, edgeCache };
  const app = createApp({ deps: () => deps });
  const env = testEnv(envOver);
  let tokenSeq = 0;

  const request = (
    path: string,
    init: RequestInit & { json?: unknown; token?: string; cookie?: string } = {},
  ) => {
    const headers = new Headers(init.headers);
    if (init.json !== undefined) {
      headers.set('Content-Type', 'application/json');
    }
    if (init.token) headers.set('Authorization', `Bearer ${init.token}`);
    if (init.cookie) headers.set('Cookie', init.cookie);
    return app.request(
      path,
      { ...init, headers, body: init.json !== undefined ? JSON.stringify(init.json) : init.body },
      env,
    );
  };

  let idSeq = 0;
  /** Clerk-like user id (`user_` + base62), unique per setup(). */
  const clerkId = () => `user_test${(++idSeq).toString().padStart(6, '0')}`;

  const users = {
    /** Clerk session whose primary e-mail is verified, WITHOUT a profile (pre-registration). */
    signedUp(email = `new${idSeq + 1}@example.org`, id = clerkId()) {
      const token = `tok-signed-${++tokenSeq}-padding-padding`;
      return { token, user: auth.add(token, { id, email, email_confirmed: true }) };
    },
    /** Clerk session whose primary e-mail is NOT verified (negative cases). */
    unverified(email = `pending${idSeq + 1}@example.org`, id = clerkId()) {
      const token = `tok-unverified-${++tokenSeq}-padding-padding`;
      return { token, user: auth.add(token, { id, email, email_confirmed: false }) };
    },
    /** Registered organizer: verified Clerk e-mail + active verified profile. */
    verified(id = clerkId(), email = `org${tokenSeq + 1}@example.org`) {
      const token = `tok-verified-${++tokenSeq}-padding-padding`;
      repo.verified.add(id);
      if (!repo.profiles.has(id)) {
        void repo.createProfile({
          user_id: id,
          display_name: 'Organizador Teste',
          email,
          email_state: 'verified',
          phone: '+5531999990000',
          territory_id: 'mg-3140001',
          consent_version: 'v1',
          contact_opt_in: false,
        });
      }
      return { token, user: auth.add(token, { id, email, email_confirmed: true }) };
    },
    /**
     * Admin (D35: admins table by Clerk id + verified e-mail; MFA not required). `_aal` is kept
     * for call-site compatibility (Clerk session tokens carry no AAL); `opts.emailConfirmed`
     * builds the negative case.
     */
    admin(_aal: 'aal1' | 'aal2' = 'aal1', id = clerkId(), opts: { emailConfirmed?: boolean } = {}) {
      const token = `tok-admin-${++tokenSeq}-padding-padding`;
      repo.admins.add(id);
      repo.verified.add(id);
      return {
        token,
        user: auth.add(token, {
          id,
          email: `admin${tokenSeq}@example.org`,
          email_confirmed: opts.emailConfirmed ?? true,
        }),
      };
    },
  };

  return {
    app,
    repo,
    auth,
    turnstile,
    userCache,
    env,
    edgeCache,
    request,
    users,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

export type ApiJson = {
  data?: Record<string, unknown> & { items?: Record<string, unknown>[] };
  error?: { code: string; message: string; fields?: Record<string, string> };
  meta: { request_id: string };
};

export async function body(res: Response): Promise<ApiJson> {
  return (await res.json()) as ApiJson;
}
