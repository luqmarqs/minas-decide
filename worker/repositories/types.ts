/**
 * Data-access contracts used by routes/services. The Supabase implementation lives in
 * `./supabase.ts`; tests use an in-memory fake with the same semantics
 * (`worker/tests/fakes.ts`). Repositories throw `AppError` with stable codes.
 */
import type {
  ActivityStatus,
  ActivityType,
  PublicContactType,
} from '../../shared/contracts/activities.ts';
import type { DataQuality, TerritoryType } from '../../shared/contracts/territory.ts';

export interface TerritoryRow {
  id: string;
  type: TerritoryType;
  name: string;
  normalized_name: string;
  slug: string;
  parent_id: string | null;
  ibge_code: string | null;
  municipality_name: string | null;
  centroid_lon: number | null;
  centroid_lat: number | null;
  data_quality: DataQuality;
}

export interface PublicGroupRow {
  id: string;
  display_name: string;
  territory_id: string;
  join_url: string;
  status: 'active';
  updated_at: string;
}

export interface GroupRow {
  id: string;
  display_name: string;
  territory_id: string;
  join_url: string;
  status: 'pending' | 'active' | 'inactive' | 'rejected' | 'suspended';
  updated_at: string;
}

export interface PublicActivityRow {
  id: string;
  title: string;
  type: ActivityType;
  description_sanitized: string;
  starts_at: string;
  ends_at: string | null;
  timezone: 'America/Sao_Paulo';
  location_public: string;
  location_lon: number;
  location_lat: number;
  territory_id: string;
  status: 'published' | 'cancelled';
  contact_public_type: PublicContactType | null;
  contact_public_value: string | null;
  rsvp_count: number;
  updated_at: string;
}

/** Internal activity row (never returned verbatim to the public). */
export interface ActivityRow {
  id: string;
  creator_user_id: string;
  territory_id: string;
  title: string;
  type: ActivityType;
  description: string;
  description_sanitized: string;
  starts_at: string;
  ends_at: string | null;
  timezone: 'America/Sao_Paulo';
  public_address: string;
  location_lon: number;
  location_lat: number;
  status: ActivityStatus;
  public_contact_opt_in: boolean;
  public_contact_type: PublicContactType | null;
  public_contact_value: string | null;
  contact_public_type: PublicContactType | null;
  contact_public_value: string | null;
  reviewed_at: string | null;
  review_reason: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

export type ActivityWrite = Pick<
  ActivityRow,
  | 'title'
  | 'type'
  | 'description'
  | 'description_sanitized'
  | 'starts_at'
  | 'ends_at'
  | 'public_address'
  | 'location_lon'
  | 'location_lat'
  | 'territory_id'
  | 'public_contact_opt_in'
  | 'public_contact_type'
  | 'public_contact_value'
>;

export type ActivityUpdate = Partial<ActivityWrite> & {
  status?: ActivityStatus;
  cancelled_at?: string | null;
};

export interface ProfileRow {
  user_id: string;
  display_name: string;
  email_contact: string;
  email_verification_state: 'unverified' | 'pending' | 'verified';
  phone_e164: string | null;
  selected_territory_id: string | null;
  consent_version: string;
  contact_opt_in_at: string | null;
  account_state: 'active' | 'suspended';
  /** P-SEC-1, discontinued by ADR 0005: always null */
  review_required_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface NewProfile {
  user_id: string;
  display_name: string;
  email: string;
  phone: string;
  territory_id: string;
  consent_version: string;
  contact_opt_in: boolean;
  email_state: ProfileRow['email_verification_state'];
}

export interface ProfilePatch {
  display_name?: string;
  selected_territory_id?: string;
  contact_opt_in?: boolean;
  email_state?: ProfileRow['email_verification_state'];
  /** E.164, already normalized */
  phone?: string;
  /** re-sync with the verified primary e-mail reported by Clerk */
  email_contact?: string;
}

export interface EraseUserResult {
  rsvps: number;
  activities: number;
  profiles: number;
  admins: number;
}

export interface NewGroupProposal {
  territory_id: string;
  name: string;
  join_url: string;
  proposer_name: string;
  proposer_email: string;
  proposer_phone: string;
  proposer_user_id: string | null;
  consent_version: string;
  idempotency_hash: string;
  /** how long the idempotency key dedupes a PENDING proposal (QA-1 F11) */
  idempotency_ttl_seconds: number;
  fingerprint_hash: string | null;
}

export interface GroupProposalRow {
  id: string;
  group_id: string | null;
  territory_id: string;
  name_proposed: string;
  join_url_proposed: string;
  proposer_name: string;
  proposer_email: string;
  proposer_phone: string;
  status: 'pending' | 'active' | 'rejected';
  created_at: string;
  reviewed_at: string | null;
  review_reason: string | null;
}

export interface RevealedContact {
  proposal_id: string;
  proposer_email: string;
  proposer_phone: string;
  revealed_at: string;
}

export interface GroupStatusRow {
  id: string;
  territory_id: string;
  status: GroupRow['status'];
  updated_at: string;
}

export interface SecurityEventRow {
  id: string;
  created_at: string;
  route: string;
  event_type: string;
  block_code: string | null;
}

export interface Cursor {
  at: string;
  id: string;
}

export interface PublicActivityQuery {
  bbox: [number, number, number, number] | null;
  territory_id: string | null;
  from: string;
  to: string | null;
  limit: number;
  cursor: Cursor | null;
}

export type RsvpIdentity = { user_id: string } | { subject_hash: string };

export interface GroupPatch {
  display_name?: string;
  join_url?: string;
  status?: 'active' | 'inactive';
}

export interface NewGroupManager {
  group_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role_label: string;
}

export interface Repo {
  // territories
  searchTerritories(normalizedQuery: string, limit: number): Promise<TerritoryRow[]>;
  getTerritories(ids: string[]): Promise<TerritoryRow[]>;
  countChildren(id: string): Promise<number>;
  /** ids of the direct children (neighborhoods of a municipality) — cache purge (QA2-04) */
  listChildIds(id: string): Promise<string[]>;
  // groups
  listActiveGroups(territoryId: string): Promise<PublicGroupRow[]>;
  createGroupProposal(
    p: NewGroupProposal,
  ): Promise<{ id: string; status: string; created: boolean }>;
  patchGroup(id: string, patch: GroupPatch): Promise<GroupRow | null>;
  // activities
  listPublicActivities(q: PublicActivityQuery): Promise<PublicActivityRow[]>;
  getPublicActivity(id: string): Promise<PublicActivityRow | null>;
  getActivity(id: string): Promise<ActivityRow | null>;
  createActivity(creatorId: string, a: ActivityWrite): Promise<ActivityRow>;
  /** Conditional update on (id, version). Returns null when the version no longer matches. */
  updateActivity(
    id: string,
    expectedVersion: number,
    patch: ActivityUpdate,
  ): Promise<ActivityRow | null>;
  listMyActivities(creatorId: string, limit: number, cursor: Cursor | null): Promise<ActivityRow[]>;
  listActivitiesByStatus(
    status: ActivityStatus,
    limit: number,
    cursor: Cursor | null,
  ): Promise<ActivityRow[]>;
  rsvpCounts(ids: string[]): Promise<Record<string, number>>;
  upsertRsvp(
    activityId: string,
    identity: RsvpIdentity,
    going: boolean,
    idempotencyHash: string | null,
  ): Promise<{ going: boolean; rsvp_count: number }>;
  // profiles / identity
  getProfile(userId: string): Promise<ProfileRow | null>;
  createProfile(p: NewProfile): Promise<{ created: boolean; profile: ProfileRow }>;
  deleteProfile(userId: string): Promise<void>;
  /**
   * LGPD erasure of one person (svc_erase_user_data): RSVPs, activities created by them,
   * profile and admin row; audited in SQL without PII. Idempotent.
   */
  eraseUserData(userId: string, requestId: string): Promise<EraseUserResult>;
  updateProfile(userId: string, patch: ProfilePatch): Promise<ProfileRow | null>;
  emailInUse(email: string, excludeUserId: string): Promise<boolean>;
  isAdmin(userId: string): Promise<boolean>;
  isEmailVerified(userId: string): Promise<boolean>;
  // moderation
  listGroupProposals(
    status: string | null,
    limit: number,
    cursor: Cursor | null,
  ): Promise<GroupProposalRow[]>;
  /** QA2-03: returns the territory too, so the public /groups cache can be purged. */
  approveGroupProposal(
    id: string,
    adminId: string,
    reason: string,
    requestId: string,
  ): Promise<{ group_id: string; territory_id: string }>;
  rejectGroupProposal(
    id: string,
    adminId: string,
    reason: string,
    requestId: string,
  ): Promise<{ territory_id: string }>;
  approveActivity(
    id: string,
    adminId: string,
    reason: string | null,
    requestId: string,
  ): Promise<number>;
  rejectActivity(id: string, adminId: string, reason: string, requestId: string): Promise<number>;
  addGroupManager(m: NewGroupManager, adminId: string, requestId: string): Promise<string>;
  /** suspend=true: active|inactive -> suspended; false: suspended -> previous (active|inactive). Audited in SQL. */
  setGroupSuspension(
    id: string,
    adminId: string,
    reason: string,
    requestId: string,
    suspend: boolean,
  ): Promise<GroupStatusRow>;
  /** suspend=true: draft|pending_review|published|cancelled -> suspended; false: back to
   *  `cancelled` if it was cancelled, else `pending_review` (QA2-09). */
  setActivitySuspension(
    id: string,
    adminId: string,
    reason: string,
    requestId: string,
    suspend: boolean,
  ): Promise<{ version: number; status: ActivityStatus }>;
  /** Full proposer contact; the audit row is written in the same transaction. */
  revealProposalContact(
    id: string,
    adminId: string,
    requestId: string,
    reason: string | null,
  ): Promise<RevealedContact>;
  // audit / abuse / turnstile
  recordAudit(e: {
    actor: string | null;
    action: string;
    entity_type: string;
    entity_id: string | null;
    request_id: string;
    reason?: string | null;
  }): Promise<void>;
  recordAbuse(e: {
    subject_hash: string | null;
    route: string;
    event_type: string;
    block_code: string | null;
  }): Promise<void>;
  listSecurityEvents(limit: number, cursor: Cursor | null): Promise<SecurityEventRow[]>;
  consumeTurnstileToken(tokenHash: string, ttlSeconds: number): Promise<boolean>;
}

/** Result of a successful Clerk session-token verification. */
export interface VerifiedSession {
  /** Clerk user id (`user_…`) */
  sub: string;
  /** verified JWT payload (custom claims `email`/`email_verified` are used when present) */
  claims: Record<string, unknown>;
}

/** What the Worker needs to know about a Clerk user (primary e-mail address). */
export interface ClerkUserInfo {
  id: string;
  /** primary e-mail, lower-cased; null when the account has none */
  email: string | null;
  /** Clerk verified the primary e-mail (code/link) */
  email_verified: boolean;
  /** banned or locked in Clerk */
  banned: boolean;
}

/** Identity provider (Clerk, ADR 0005). Fakes implement it in worker/tests/fakes.ts. */
export interface AuthGateway {
  /** Verifies a Clerk session token (JWKS signature, exp/nbf, azp). null when invalid. */
  verify(token: string): Promise<VerifiedSession | null>;
  /** Backend API lookup; null when the user does not exist. Throws AppError on outage. */
  getUser(userId: string): Promise<ClerkUserInfo | null>;
  /** Backend API lookup by e-mail (scripts / admin bootstrap). */
  findUserByEmail(email: string): Promise<ClerkUserInfo | null>;
}
