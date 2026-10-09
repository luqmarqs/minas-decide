import { Hono } from 'hono';
import { z } from 'zod';
import { ActivityStatus } from '../../shared/contracts/activities.ts';
import {
  AdminGroupPatch,
  AdminQueueQuery,
  GroupManagerInput,
  ModerationDecision,
  type AdminRevealContactResponse,
} from '../../shared/contracts/admin.ts';
import { isWhatsAppInviteUrl } from '../../shared/contracts/groups.ts';
import { normalizeBrazilPhone } from '../../shared/schemas/phone.ts';
import { sanitizePlainText } from '../../shared/schemas/sanitize.ts';
import type { AppBindings } from '../env.ts';
import { fail } from '../errors.ts';
import { ok, parse, parseBody, readJson, uuidParam } from '../http.ts';
import { requireAdmin } from '../middleware/auth.ts';
import { activityPaths, noStore, purgeGroups, purgePublic } from '../middleware/cache.ts';
import { decodeCursor, encodeCursor } from '../services/crypto.ts';
import { toAdminActivity, toAdminProposal } from '../services/projections.ts';
import type { Cursor, GroupPatch } from '../repositories/types.ts';

export const admin = new Hono<AppBindings>();

// Every admin route: no-store + admins table (MFA not required — D35). Denials are logged (T22).
admin.use('/admin/*', noStore, requireAdmin);

function cursorOrThrow(raw: string | undefined): Cursor | null {
  if (!raw) return null;
  const c = decodeCursor(raw, ['at', 'id']);
  if (!c?.at || !c.id || Number.isNaN(Date.parse(c.at))) {
    throw fail('VALIDATION_ERROR', undefined, { cursor: 'Cursor inválido.' });
  }
  return { at: c.at, id: c.id };
}

const ProposalStatus = z.enum(['pending', 'active', 'rejected']);

admin.get('/admin/queue', async (c) => {
  const q = parse(AdminQueueQuery, c.req.query());
  const { repo } = c.get('deps');
  const cursor = cursorOrThrow(q.cursor);
  if (q.kind === 'groups') {
    const status = q.status === 'all' ? null : parse(ProposalStatus, q.status ?? 'pending');
    const rows = await repo.listGroupProposals(status, q.limit, cursor);
    const page = rows.slice(0, q.limit);
    const last = page[page.length - 1];
    return ok(c, {
      kind: 'groups' as const,
      items: page.map(toAdminProposal),
      next_cursor:
        rows.length > q.limit && last ? encodeCursor({ at: last.created_at, id: last.id }) : null,
    });
  }
  const status = parse(ActivityStatus, q.status ?? 'pending_review');
  const rows = await repo.listActivitiesByStatus(status, q.limit, cursor);
  const page = rows.slice(0, q.limit);
  const last = page[page.length - 1];
  return ok(c, {
    kind: 'activities' as const,
    items: page.map(toAdminActivity),
    next_cursor:
      rows.length > q.limit && last ? encodeCursor({ at: last.created_at, id: last.id }) : null,
  });
});

const OptionalDecision = z.object({ reason: z.string().trim().min(3).max(500).optional() });

// NOTE: :id in /admin/groups/:id/approve|reject is the PROPOSAL id listed by the queue.
admin.post('/admin/groups/:id/approve', async (c) => {
  const id = uuidParam(c);
  const { reason } = OptionalDecision.parse(await readJson(c, true));
  const r = await c
    .get('deps')
    .repo.approveGroupProposal(id, c.get('user')!.id, reason ?? 'aprovado', c.get('requestId'));
  await purgeGroups(c, r.territory_id); // QA2-03
  return ok(c, { proposal_id: id, group_id: r.group_id, status: 'active' as const });
});

admin.post('/admin/groups/:id/reject', async (c) => {
  const id = uuidParam(c);
  const { reason } = await parseBody(c, ModerationDecision);
  const r = await c
    .get('deps')
    .repo.rejectGroupProposal(id, c.get('user')!.id, reason, c.get('requestId'));
  // A rejection creates no public group; purged anyway so the rule is uniform (QA2-03).
  await purgeGroups(c, r.territory_id);
  return ok(c, { proposal_id: id, status: 'rejected' as const });
});

admin.post('/admin/activities/:id/approve', async (c) => {
  const id = uuidParam(c);
  const { reason } = OptionalDecision.parse(await readJson(c, true));
  const version = await c
    .get('deps')
    .repo.approveActivity(id, c.get('user')!.id, reason ?? null, c.get('requestId'));
  await purgePublic(c, activityPaths(id));
  return ok(c, { id, status: 'published' as const, version });
});

admin.post('/admin/activities/:id/reject', async (c) => {
  const id = uuidParam(c);
  const { reason } = await parseBody(c, ModerationDecision);
  const version = await c
    .get('deps')
    .repo.rejectActivity(id, c.get('user')!.id, reason, c.get('requestId'));
  await purgePublic(c, activityPaths(id));
  return ok(c, { id, status: 'rejected' as const, version });
});

admin.patch('/admin/groups/:id', async (c) => {
  const id = uuidParam(c);
  const input = await parseBody(c, AdminGroupPatch);
  if (input.join_url !== undefined && !isWhatsAppInviteUrl(input.join_url)) {
    throw fail('VALIDATION_ERROR', undefined, {
      join_url: 'Informe um link de convite oficial do WhatsApp.',
    });
  }
  const patch: GroupPatch = {
    ...(input.display_name !== undefined
      ? { display_name: sanitizePlainText(input.display_name, 80) }
      : {}),
    ...(input.join_url !== undefined ? { join_url: input.join_url } : {}),
    ...(input.status !== undefined ? { status: input.status } : {}),
  };
  if (Object.keys(patch).length === 0) throw fail('VALIDATION_ERROR', 'Nada para alterar.');
  const { repo } = c.get('deps');
  const updated = await repo.patchGroup(id, patch);
  if (!updated) throw fail('NOT_FOUND');
  await purgeGroups(c, updated.territory_id);
  await repo.recordAudit({
    actor: c.get('user')!.id,
    action: 'group.update',
    entity_type: 'whatsapp_group',
    entity_id: id,
    request_id: c.get('requestId'),
    reason: input.reason,
  });
  return ok(c, {
    id: updated.id,
    display_name: updated.display_name,
    territory_id: updated.territory_id,
    join_url: updated.join_url,
    status: updated.status,
    updated_at: updated.updated_at,
  });
});

admin.post('/admin/groups/:id/managers', async (c) => {
  const id = uuidParam(c);
  const input = await parseBody(c, GroupManagerInput);
  let phone: string | null = null;
  if (input.phone) {
    phone = normalizeBrazilPhone(input.phone);
    if (!phone) throw fail('VALIDATION_ERROR', undefined, { phone: 'Telefone inválido.' });
  }
  const managerId = await c.get('deps').repo.addGroupManager(
    {
      group_id: id,
      name: sanitizePlainText(input.name, 120),
      email: input.email ?? null,
      phone,
      role_label: sanitizePlainText(input.role_label, 60) || 'responsável',
    },
    c.get('user')!.id,
    c.get('requestId'),
  );
  return ok(c, { id: managerId, group_id: id }, 201);
});

// ---------------------------------------------------------------- suspension
// NOTE: here :id is the GROUP id (whatsapp_groups.id), not the proposal id.
admin.post('/admin/groups/:id/suspend', async (c) => {
  const id = uuidParam(c);
  const { reason } = await parseBody(c, ModerationDecision);
  const row = await c
    .get('deps')
    .repo.setGroupSuspension(id, c.get('user')!.id, reason, c.get('requestId'), true);
  await purgeGroups(c, row.territory_id);
  return ok(c, { id: row.id, status: row.status, updated_at: row.updated_at });
});

/** Lifts a suspension: the group goes back to its previous state (`active` or `inactive`, QA2-09). */
admin.post('/admin/groups/:id/unsuspend', async (c) => {
  const id = uuidParam(c);
  const { reason } = await parseBody(c, ModerationDecision);
  const row = await c
    .get('deps')
    .repo.setGroupSuspension(id, c.get('user')!.id, reason, c.get('requestId'), false);
  await purgeGroups(c, row.territory_id);
  return ok(c, { id: row.id, status: row.status, updated_at: row.updated_at });
});

admin.post('/admin/activities/:id/suspend', async (c) => {
  const id = uuidParam(c);
  const { reason } = await parseBody(c, ModerationDecision);
  const r = await c
    .get('deps')
    .repo.setActivitySuspension(id, c.get('user')!.id, reason, c.get('requestId'), true);
  await purgePublic(c, activityPaths(id));
  return ok(c, { id, status: 'suspended' as const, version: r.version });
});

/**
 * Lifts a suspension (QA2-09): an activity that was `cancelled` goes back to `cancelled`;
 * any other returns to `pending_review` and must be approved again.
 */
admin.post('/admin/activities/:id/unsuspend', async (c) => {
  const id = uuidParam(c);
  const { reason } = await parseBody(c, ModerationDecision);
  const r = await c
    .get('deps')
    .repo.setActivitySuspension(id, c.get('user')!.id, reason, c.get('requestId'), false);
  await purgePublic(c, activityPaths(id));
  return ok(c, { id, status: r.status, version: r.version });
});

// ---------------------------------------------------------------- audited contact reveal
const RevealInput = z.object({ reason: z.string().trim().min(3).max(500).optional() });

/**
 * Full proposer e-mail/phone. Admin only (MFA not required — D35). The read and the audit
 * row (`proposal.reveal_contact`, retention `security`) commit in the same transaction.
 */
admin.post('/admin/group-proposals/:id/reveal-contact', async (c) => {
  const user = c.get('user')!; // D35: no MFA requirement; the read stays audited
  const id = uuidParam(c);
  const { reason } = RevealInput.parse(await readJson(c, true));
  const r = await c
    .get('deps')
    .repo.revealProposalContact(id, user.id, c.get('requestId'), reason ?? null);
  const body: AdminRevealContactResponse = {
    proposal_id: r.proposal_id,
    proposer_email: r.proposer_email,
    proposer_phone: r.proposer_phone,
    revealed_at: r.revealed_at,
  };
  return ok(c, body);
});

const SecurityEventsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().max(400).optional(),
});

admin.get('/admin/security-events', async (c) => {
  const q = parse(SecurityEventsQuery, c.req.query());
  const rows = await c.get('deps').repo.listSecurityEvents(q.limit, cursorOrThrow(q.cursor));
  const page = rows.slice(0, q.limit);
  const last = page[page.length - 1];
  return ok(c, {
    items: page.map((e) => ({
      id: e.id,
      created_at: e.created_at,
      route: e.route,
      event_type: e.event_type,
      block_code: e.block_code,
    })),
    next_cursor:
      rows.length > q.limit && last ? encodeCursor({ at: last.created_at, id: last.id }) : null,
  });
});
