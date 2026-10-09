/**
 * Data-access contracts used by routes/services. The Supabase implementation lives in
 * `./supabase.ts`; tests use an in-memory fake with the same semantics
 * (`worker/tests/fakes.ts`). Repositories throw `AppError` with stable codes.
 */
import type { ActivityStatus, ActivityType, PublicContactType } from '../../shared/contracts/activities.ts';
import type { DataQuality, TerritoryType } from '../../shared/contracts/territory.ts';
import type { AuthUser } from '../env.ts';

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
  status: 'pending' | 'active' | 'inactive' | 'rejected';
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
  fingerprint_hash: string | null;
}

export interface GroupProposalRow {
  id: string;
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
  // groups
  listActiveGroups(territoryId: string): Promise<PublicGroupRow[]>;
  createGroupProposal(p: NewGroupProposal): Promise<{ id: string; status: string; created: boolean }>;
  patchGroup(id: string, patch: GroupPatch): Promise<GroupRow | null>;
  // activities
  listPublicActivities(q: PublicActivityQuery): Promise<PublicActivityRow[]>;
  getPublicActivity(id: string): Promise<PublicActivityRow | null>;
  getActivity(id: string): Promise<ActivityRow | null>;
  createActivity(creatorId: string, a: ActivityWrite): Promise<ActivityRow>;
  /** Conditional update on (id, version). Returns null when the version no longer matches. */
  updateActivity(id: string, expectedVersion: number, patch: ActivityUpdate): Promise<ActivityRow | null>;
  listMyActivities(creatorId: string, limit: number, cursor: Cursor | null): Promise<ActivityRow[]>;
  listActivitiesByStatus(status: ActivityStatus, limit: number, cursor: Cursor | null): Promise<ActivityRow[]>;
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
  updateProfile(userId: string, patch: ProfilePatch): Promise<ProfileRow | null>;
  emailInUse(email: string, excludeUserId: string): Promise<boolean>;
  isAdmin(userId: string): Promise<boolean>;
  isEmailVerified(userId: string): Promise<boolean>;
  // moderation
  listGroupProposals(status: string | null, limit: number, cursor: Cursor | null): Promise<GroupProposalRow[]>;
  approveGroupProposal(id: string, adminId: string, reason: string, requestId: string): Promise<string>;
  rejectGroupProposal(id: string, adminId: string, reason: string, requestId: string): Promise<void>;
  approveActivity(id: string, adminId: string, reason: string | null, requestId: string): Promise<number>;
  rejectActivity(id: string, adminId: string, reason: string, requestId: string): Promise<number>;
  addGroupManager(m: NewGroupManager, adminId: string, requestId: string): Promise<string>;
  // audit / abuse / turnstile
  recordAudit(e: {
    actor: string | null;
    action: string;
    entity_type: string;
    entity_id: string | null;
    request_id: string;
    reason?: string | null;
  }): Promise<void>;
  recordAbuse(e: { subject_hash: string | null; route: string; event_type: string; block_code: string | null }): Promise<void>;
  listSecurityEvents(limit: number, cursor: Cursor | null): Promise<SecurityEventRow[]>;
  consumeTurnstileToken(tokenHash: string, ttlSeconds: number): Promise<boolean>;
}

export type LinkEmailResult = { ok: true } | { ok: false; reason: 'error' };

export interface AuthGateway {
  /** Validates the access token with Supabase Auth. Returns null when invalid/expired. */
  getUser(accessToken: string): Promise<AuthUser | null>;
  /** Attach an UNCONFIRMED e-mail to the (anonymous) user. Sends no e-mail by itself. */
  linkEmail(userId: string, email: string): Promise<LinkEmailResult>;
  /** Mark e-mail confirmed and turn the anonymous user permanent (spike: re-set same e-mail). */
  promoteVerified(userId: string, email: string): Promise<boolean>;
  /** Revoke every other session (refresh token) of the token's user. */
  signOutOthers(accessToken: string): Promise<boolean>;
  /** Magic link for an EXISTING user only (shouldCreateUser: false). Result is never shown verbatim. */
  sendMagicLink(email: string, redirectTo: string): Promise<{ ok: boolean; code: string | null }>;
}
