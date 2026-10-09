/**
 * The ONLY place where internal rows become public payloads. Every function builds the
 * response field by field from an allow-list (never spreads a row), so new internal
 * columns can't leak by accident (spec §7.6, T14).
 */
import type { MyActivity, PublicActivity } from '../../shared/contracts/activities.ts';
import type { AdminActivity, AdminGroupProposal } from '../../shared/contracts/admin.ts';
import type { PublicGroup } from '../../shared/contracts/groups.ts';
import type { TerritorySearchItem, TerritorySummary } from '../../shared/contracts/territory.ts';
import { maskEmail, maskPhone } from '../../shared/schemas/phone.ts';
import type {
  ActivityRow,
  GroupProposalRow,
  PublicActivityRow,
  PublicGroupRow,
  TerritoryRow,
} from '../repositories/types.ts';

export function toPublicGroup(g: PublicGroupRow): PublicGroup {
  return {
    id: g.id,
    display_name: g.display_name,
    territory_id: g.territory_id,
    join_url: g.join_url,
    status: 'active',
    updated_at: g.updated_at,
  };
}

function contact(type: ActivityRow['contact_public_type'], value: string | null): PublicActivity['contact_public'] {
  return type && value ? { type, value } : null;
}

export function toPublicActivity(a: PublicActivityRow): PublicActivity {
  return {
    id: a.id,
    title: a.title,
    type: a.type,
    description_sanitized: a.description_sanitized,
    starts_at: a.starts_at,
    ends_at: a.ends_at,
    timezone: 'America/Sao_Paulo',
    location_public: a.location_public,
    coordinates: [a.location_lon, a.location_lat],
    territory_id: a.territory_id,
    status: a.status,
    rsvp_count_approx: Math.max(0, a.rsvp_count ?? 0),
    contact_public: contact(a.contact_public_type, a.contact_public_value),
    updated_at: a.updated_at,
  };
}

export function toMyActivity(a: ActivityRow, rsvpCount = 0): MyActivity {
  return {
    id: a.id,
    title: a.title,
    type: a.type,
    description_sanitized: a.description_sanitized,
    starts_at: a.starts_at,
    ends_at: a.ends_at,
    timezone: 'America/Sao_Paulo',
    location_public: a.public_address,
    coordinates: [a.location_lon, a.location_lat],
    territory_id: a.territory_id,
    status: a.status,
    rsvp_count_approx: rsvpCount,
    contact_public: contact(a.contact_public_type, a.contact_public_value),
    updated_at: a.updated_at,
    review_reason: a.review_reason,
    version: a.version,
  };
}

export function toAdminActivity(a: ActivityRow): AdminActivity {
  return {
    id: a.id,
    title: a.title,
    type: a.type,
    description: a.description_sanitized,
    territory_id: a.territory_id,
    public_address: a.public_address,
    starts_at: a.starts_at,
    status: a.status,
    creator_user_id: a.creator_user_id,
    public_contact_opt_in: a.public_contact_opt_in,
    created_at: a.created_at,
    reviewed_at: a.reviewed_at,
    review_reason: a.review_reason,
    version: a.version,
  };
}

/** Admin queue still masks proposer contact (full contact only via a future audited endpoint). */
export function toAdminProposal(p: GroupProposalRow): AdminGroupProposal {
  return {
    id: p.id,
    territory_id: p.territory_id,
    name_proposed: p.name_proposed,
    join_url_proposed: p.join_url_proposed,
    proposer_name: p.proposer_name,
    proposer_email_masked: maskEmail(p.proposer_email),
    proposer_phone_masked: maskPhone(p.proposer_phone),
    status: p.status,
    created_at: p.created_at,
    reviewed_at: p.reviewed_at,
    review_reason: p.review_reason,
  };
}

export function toTerritorySummary(t: TerritoryRow): TerritorySummary {
  return {
    id: t.id,
    type: t.type,
    name: t.name,
    slug: t.slug,
    parent_id: t.parent_id,
    ibge_code: t.ibge_code,
    state_code: 'MG',
    centroid: t.centroid_lon !== null && t.centroid_lat !== null ? [t.centroid_lon, t.centroid_lat] : null,
    data_quality: t.data_quality,
  };
}

export function toSearchItem(t: TerritoryRow): TerritorySearchItem {
  const label =
    t.type === 'neighborhood'
      ? `${t.name} — ${t.municipality_name ?? 'MG'}/MG`
      : t.type === 'municipality'
        ? `${t.name}/MG`
        : 'Minas Gerais';
  return {
    id: t.id,
    type: t.type,
    name: t.name,
    slug: t.slug,
    label,
    municipality_name: t.type === 'neighborhood' ? t.municipality_name : t.type === 'municipality' ? t.name : null,
  };
}
