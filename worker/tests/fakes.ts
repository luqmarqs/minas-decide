/**
 * In-memory fakes for Worker tests. FakeRepo mirrors the SQL semantics of migrations
 * 0005–0007 (conditional moderation updates, idempotent RSVP/proposals, public projections)
 * so route logic can be exercised with app.request(). These are NOT a substitute for the
 * real RLS tests in supabase/tests (which run against the TARGET dev project).
 */
import { createApp } from '../app.ts';
import type { AuthUser, Deps, EdgeCache, Env } from '../env.ts';
import { fail } from '../errors.ts';
import { SlidingWindowLimiter } from '../middleware/rate-limit.ts';
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
  LinkEmailResult,
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
  groups: (GroupRow & { managers: NewGroupManager[]; source_proposal_id: string | null })[] = [];
  proposals: StoredProposal[] = [];
  activities: ActivityRow[] = [];
  rsvps: Rsvp[] = [];
  profiles = new Map<string, ProfileRow>();
  admins = new Set<string>();
  verified = new Set<string>();
  authEmails = new Map<string, string>(); // email -> user id (mirror of auth.users)
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
    if (patch.review_required !== undefined)
      p.review_required_at = patch.review_required ? iso(this.clock()) : null;
    return p;
  }
  async emailInUse(email: string, exclude: string) {
    const owner = this.authEmails.get(email);
    return owner !== undefined && owner !== exclude;
  }
  async isAdmin(id: string) {
    return this.admins.has(id);
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
    return g.id;
  }
  async rejectGroupProposal(id: string, adminId: string, reason: string) {
    if (!this.admins.has(adminId)) throw fail('FORBIDDEN');
    const p = this.proposals.find((x) => x.id === id);
    if (!p) throw fail('NOT_FOUND');
    if (p.status !== 'pending') throw fail('CONFLICT');
    p.status = 'rejected';
    p.review_reason = reason;
    this.audit.push({ actor: adminId, action: 'group_proposal.reject', entity_id: id });
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
    g.status = suspend ? 'suspended' : 'active';
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
  ): Promise<number> {
    if (!this.admins.has(adminId)) throw fail('FORBIDDEN');
    const a = this.activities.find((x) => x.id === id);
    if (!a) throw fail('NOT_FOUND');
    const allowed = suspend ? ['draft', 'pending_review', 'published', 'cancelled'] : ['suspended'];
    if (!allowed.includes(a.status)) throw fail('CONFLICT');
    a.status = suspend ? 'suspended' : 'pending_review';
    a.review_reason = reason;
    a.version += 1;
    this.audit.push({
      actor: adminId,
      action: suspend ? 'activity.suspend' : 'activity.unsuspend',
      entity_id: id,
      reason,
    });
    return a.version;
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

export class FakeAuth implements AuthGateway {
  users = new Map<string, AuthUser>(); // token -> user
  linked: { userId: string; email: string }[] = [];
  promoted: string[] = [];
  signedOutOthers: string[] = [];
  magicLinks: string[] = [];
  magicLinkOk = true;
  linkOk = true;

  constructor(private readonly repo: FakeRepo) {}

  add(token: string, user: Partial<AuthUser> & { id: string }): AuthUser {
    const u: AuthUser = {
      email: null,
      email_confirmed: false,
      is_anonymous: false,
      jwt_is_anonymous: false,
      aal: 'aal1',
      amr_methods: ['password'],
      ...user,
    };
    this.users.set(token, u);
    if (u.email) this.repo.authEmails.set(u.email, u.id);
    return u;
  }
  async getUser(token: string) {
    return this.users.get(token) ?? null;
  }
  async linkEmail(userId: string, email: string): Promise<LinkEmailResult> {
    if (!this.linkOk) return { ok: false, reason: 'error' };
    this.linked.push({ userId, email });
    this.repo.authEmails.set(email, userId);
    return { ok: true };
  }
  async promoteVerified(userId: string) {
    this.promoted.push(userId);
    this.repo.verified.add(userId);
    return true;
  }
  async signOutOthers(token: string) {
    this.signedOutOthers.push(token);
    return true;
  }
  async sendMagicLink(email: string) {
    this.magicLinks.push(email);
    return this.magicLinkOk
      ? { ok: true, code: null }
      : { ok: false, code: 'over_email_send_rate_limit' };
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
    SUPABASE_TARGET_ANON_KEY: 'anon-placeholder',
    SUPABASE_TARGET_SERVICE_ROLE_KEY: 'service-placeholder',
    TURNSTILE_SECRET_KEY: 'non-test-secret-placeholder',
    RSVP_DEVICE_SECRET: 'device-secret-placeholder-0123456789',
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
  const auth = new FakeAuth(repo);
  const turnstile = new FakeTurnstile();
  const limiter = new SlidingWindowLimiter();
  const edgeCache = opts.edgeCache ? new FakeEdgeCache() : null;
  const deps: Deps = { repo, auth, turnstile, limiter, now: clock, edgeCache };
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

  const users = {
    anonymous(id = repo.uuid()) {
      const token = `tok-anon-${++tokenSeq}-padding-padding`;
      return {
        token,
        user: auth.add(token, {
          id,
          is_anonymous: true,
          jwt_is_anonymous: true,
          amr_methods: ['anonymous'],
        }),
      };
    },
    verified(id = repo.uuid(), email = `org${tokenSeq + 1}@example.org`) {
      const token = `tok-verified-${++tokenSeq}-padding-padding`;
      repo.verified.add(id);
      // Real flow: profile created at registration, promoted by /auth/confirm-email.
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
      return {
        token,
        user: auth.add(token, { id, email, email_confirmed: true, amr_methods: ['otp'] }),
      };
    },
    admin(aal: 'aal1' | 'aal2' = 'aal2', id = repo.uuid()) {
      const token = `tok-admin-${++tokenSeq}-padding-padding`;
      repo.admins.add(id);
      repo.verified.add(id);
      return {
        token,
        user: auth.add(token, {
          id,
          email: `admin${tokenSeq}@example.org`,
          email_confirmed: true,
          aal,
        }),
      };
    },
  };

  return {
    app,
    repo,
    auth,
    turnstile,
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
