import { Hono, type Context } from 'hono';
import { z } from 'zod';
import {
  ActivityInput,
  ActivityPatch,
  PublicActivitiesQuery,
} from '../../shared/contracts/activities.ts';
import type { AppBindings, AuthUser } from '../env.ts';
import { fail } from '../errors.ts';
import { ok, parse, readJson, uuidParam } from '../http.ts';
import {
  assertOrganizer,
  isAdminWithMfa,
  requireOrganizer,
  requireSession,
} from '../middleware/auth.ts';
import {
  ACTIVITIES_KEY,
  activityPaths,
  edgeCached,
  noStore,
  purgePublic,
} from '../middleware/cache.ts';
import { rateLimit } from '../middleware/rate-limit.ts';
import { requireTurnstile } from '../middleware/turnstile.ts';
import { buildActivityPatch, buildActivityWrite } from '../services/activities.ts';
import { decodeCursor, encodeCursor } from '../services/crypto.ts';
import { toMyActivity, toPublicActivity } from '../services/projections.ts';
import type { ActivityRow, Cursor } from '../repositories/types.ts';

export const activities = new Hono<AppBindings>();

/** Max bbox span (degrees). MG spans ~12° lon × ~9° lat. */
const MAX_BBOX_SPAN = 15;

function parseBbox(raw: string | undefined): [number, number, number, number] | null {
  if (!raw) return null;
  const parts = raw.split(',').map(Number);
  const [minLon, minLat, maxLon, maxLat] = parts as [number, number, number, number];
  const valid =
    parts.length === 4 &&
    parts.every(Number.isFinite) &&
    minLon >= -180 &&
    maxLon <= 180 &&
    minLat >= -90 &&
    maxLat <= 90 &&
    minLon < maxLon &&
    minLat < maxLat &&
    maxLon - minLon <= MAX_BBOX_SPAN &&
    maxLat - minLat <= MAX_BBOX_SPAN;
  if (!valid)
    throw fail('VALIDATION_ERROR', undefined, { bbox: 'bbox inválido ou grande demais.' });
  return [minLon, minLat, maxLon, maxLat];
}

function cursorOrThrow(raw: string | undefined): Cursor | null {
  if (!raw) return null;
  const c = decodeCursor(raw, ['at', 'id']);
  if (!c || Number.isNaN(Date.parse(c.at ?? '')))
    throw fail('VALIDATION_ERROR', undefined, { cursor: 'Cursor inválido.' });
  return { at: c.at!, id: c.id! };
}

activities.get('/activities', edgeCached(60, ACTIVITIES_KEY), async (c) => {
  const q = parse(PublicActivitiesQuery, c.req.query());
  const now = c.get('deps').now();
  const from = q.from ?? new Date(now - 6 * 3600_000).toISOString();
  if (q.to && Date.parse(q.to) < Date.parse(from)) {
    throw fail('VALIDATION_ERROR', undefined, { to: '"to" deve ser depois de "from".' });
  }
  const rows = await c.get('deps').repo.listPublicActivities({
    bbox: parseBbox(q.bbox),
    territory_id: q.territory_id ?? null,
    from: new Date(from).toISOString(),
    to: q.to ? new Date(q.to).toISOString() : null,
    limit: q.limit,
    cursor: cursorOrThrow(q.cursor),
  });
  const page = rows.slice(0, q.limit);
  const last = page[page.length - 1];
  return ok(c, {
    items: page.map(toPublicActivity),
    next_cursor:
      rows.length > q.limit && last ? encodeCursor({ at: last.starts_at, id: last.id }) : null,
  });
});

activities.get('/activities/:id', edgeCached(60), async (c) => {
  const row = await c.get('deps').repo.getPublicActivity(uuidParam(c));
  if (!row) throw fail('NOT_FOUND');
  return ok(c, toPublicActivity(row));
});

const MyActivitiesQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().max(400).optional(),
});

activities.get('/my-activities', noStore, requireOrganizer, async (c) => {
  const q = parse(MyActivitiesQuery, c.req.query());
  const user = c.get('user')!;
  const { repo } = c.get('deps');
  const rows = await repo.listMyActivities(user.id, q.limit, cursorOrThrow(q.cursor));
  const page = rows.slice(0, q.limit);
  const counts = await repo.rsvpCounts(
    page.filter((r) => r.status === 'published' || r.status === 'cancelled').map((r) => r.id),
  );
  const last = page[page.length - 1];
  return ok(c, {
    items: page.map((r) => toMyActivity(r, counts[r.id] ?? 0)),
    next_cursor:
      rows.length > q.limit && last ? encodeCursor({ at: last.created_at, id: last.id }) : null,
  });
});

activities.post(
  '/activities',
  noStore,
  rateLimit('activities_write'),
  requireOrganizer,
  async (c) => {
    const input = ActivityInput.parse(await readJson(c));
    // Turnstile is "per risk" for activities (spec §9.4): verified whenever the client sends one.
    if (input.turnstile_token)
      await requireTurnstile(c, input.turnstile_token, 'activities', 'activity');
    const { repo, now } = c.get('deps');
    const write = buildActivityWrite(input, now());
    const [territory] = await repo.getTerritories([write.territory_id]);
    if (!territory)
      throw fail('VALIDATION_ERROR', undefined, { territory_id: 'Território inexistente.' });
    const user = c.get('user')!;
    const row = await repo.createActivity(user.id, write);
    await repo.recordAudit({
      actor: user.id,
      action: 'activity.create',
      entity_type: 'activity',
      entity_id: row.id,
      request_id: c.get('requestId'),
    });
    return ok(c, toMyActivity(row), 201);
  },
);

/** Loads an activity the caller may manage: its author (verified organizer) or an admin with MFA. */
async function loadManageable(
  c: Context<AppBindings>,
  user: AuthUser,
  id: string,
): Promise<{ row: ActivityRow; asAdmin: boolean }> {
  const { repo } = c.get('deps');
  const row = await repo.getActivity(id);
  if (row && row.creator_user_id === user.id) {
    await assertOrganizer(c, user);
    return { row, asAdmin: false };
  }
  if (row && (await isAdminWithMfa(c, user))) return { row, asAdmin: true };
  // Non-owners get 404 (no existence oracle for pending activities).
  throw fail('NOT_FOUND');
}

const EDITABLE = new Set(['draft', 'pending_review', 'published']);

activities.patch(
  '/activities/:id',
  noStore,
  rateLimit('activities_write'),
  requireSession,
  async (c) => {
    const id = uuidParam(c);
    const raw = await readJson(c);
    const parsed = ActivityPatch.parse(raw);
    const presentKeys = new Set(raw && typeof raw === 'object' ? Object.keys(raw) : []);
    const user = c.get('user')!;
    const { repo, now } = c.get('deps');
    const { row, asAdmin } = await loadManageable(c, user, id);
    if (!EDITABLE.has(row.status))
      throw fail('CONFLICT', 'Esta atividade não pode mais ser editada.');
    if (parsed.version !== row.version)
      throw fail('CONFLICT', 'A atividade foi alterada. Recarregue e tente de novo.');

    const { update, sensitive } = buildActivityPatch(row, parsed, presentKeys, now());
    if (update.territory_id && update.territory_id !== row.territory_id) {
      const [t] = await repo.getTerritories([update.territory_id]);
      if (!t)
        throw fail('VALIDATION_ERROR', undefined, { territory_id: 'Território inexistente.' });
    }
    // Sensitive edits by the author of a published activity go back to moderation (T21).
    if (sensitive && !asAdmin && row.status === 'published') update.status = 'pending_review';

    const updated = await repo.updateActivity(id, row.version, update);
    if (!updated) throw fail('CONFLICT', 'A atividade foi alterada. Recarregue e tente de novo.');
    await purgePublic(c, activityPaths(id));
    await repo.recordAudit({
      actor: user.id,
      action: sensitive ? 'activity.update_sensitive' : 'activity.update',
      entity_type: 'activity',
      entity_id: id,
      request_id: c.get('requestId'),
    });
    const counts = await repo.rsvpCounts([id]);
    return ok(c, toMyActivity(updated, counts[id] ?? 0));
  },
);

const CancelInput = z.object({
  version: z.number().int().positive().optional(),
  reason: z.string().trim().max(500).optional(),
});

activities.post(
  '/activities/:id/cancel',
  noStore,
  rateLimit('activities_write'),
  requireSession,
  async (c) => {
    const id = uuidParam(c);
    const input = CancelInput.parse(await readJson(c, true));
    const user = c.get('user')!;
    const { repo, now } = c.get('deps');
    const { row } = await loadManageable(c, user, id);
    if (!EDITABLE.has(row.status)) throw fail('CONFLICT', 'Esta atividade não pode ser cancelada.');
    if (input.version !== undefined && input.version !== row.version) throw fail('CONFLICT');
    const updated = await repo.updateActivity(id, row.version, {
      status: 'cancelled',
      cancelled_at: new Date(now()).toISOString(),
    });
    if (!updated) throw fail('CONFLICT');
    await purgePublic(c, activityPaths(id));
    await repo.recordAudit({
      actor: user.id,
      action: 'activity.cancel',
      entity_type: 'activity',
      entity_id: id,
      request_id: c.get('requestId'),
      reason: input.reason ?? null,
    });
    const counts = await repo.rsvpCounts([id]);
    return ok(c, toMyActivity(updated, counts[id] ?? 0));
  },
);
