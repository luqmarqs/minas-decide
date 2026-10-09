import { Hono } from 'hono';
import { z } from 'zod';
import { GroupProposalInput, type PublicGroupsResponse } from '../../shared/contracts/groups.ts';
import { municipalityIdOf } from '../../shared/contracts/snapshot.ts';
import { TerritoryId } from '../../shared/contracts/territory.ts';
import { normalizeBrazilPhone } from '../../shared/schemas/phone.ts';
import { sanitizePlainText } from '../../shared/schemas/sanitize.ts';
import type { AppBindings } from '../env.ts';
import { fail } from '../errors.ts';
import { clientIp, ok, parse, parseBody } from '../http.ts';
import { optionalSession } from '../middleware/auth.ts';
import { edgeCached, GROUPS_KEY, noStore } from '../middleware/cache.ts';
import { rateLimit, subjectHash } from '../middleware/rate-limit.ts';
import { requireTurnstile } from '../middleware/turnstile.ts';
import { sha256Hex } from '../services/crypto.ts';
import { toPublicGroup } from '../services/projections.ts';

export const groups = new Hono<AppBindings>();

const IDEMPOTENCY_TTL_SECONDS = 86_400;

const GroupsQuery = z.object({ territory_id: TerritoryId });

/** Approved groups only (view whatsapp_groups_public). Falls back to the municipality. */
groups.get('/groups', edgeCached(60, GROUPS_KEY), async (c) => {
  const { territory_id } = parse(GroupsQuery, c.req.query());
  const { repo } = c.get('deps');
  let body: PublicGroupsResponse = { items: [], fallback: 'none' };
  const exact = await repo.listActiveGroups(territory_id);
  if (exact.length) {
    body = { items: exact.map(toPublicGroup), fallback: 'exact' };
  } else {
    const muni = municipalityIdOf(territory_id);
    if (muni && muni !== territory_id && muni !== 'mg') {
      const parent = await repo.listActiveGroups(muni);
      if (parent.length) body = { items: parent.map(toPublicGroup), fallback: 'municipality' };
    }
  }
  return ok(c, body);
});

groups.post('/groups/proposals', noStore, rateLimit('proposals'), optionalSession, async (c) => {
  const input = await parseBody(c, GroupProposalInput);
  const phone = normalizeBrazilPhone(input.proposer_phone);
  if (!phone) {
    throw fail('VALIDATION_ERROR', undefined, {
      proposer_phone: 'Informe um WhatsApp brasileiro válido com DDD.',
    });
  }
  await requireTurnstile(c, input.turnstile_token, 'proposals', 'group_proposal');

  const { repo } = c.get('deps');
  const [territory] = await repo.getTerritories([input.territory_id]);
  if (!territory)
    throw fail('VALIDATION_ERROR', undefined, { territory_id: 'Território inexistente.' });

  // Idempotency (QA-1 F11): an explicit key dedupes for 24 h; without one, a CONTENT key
  // scoped to the current UTC day dedupes accidental re-submits. Either key only matches a
  // proposal that is still PENDING (decided/expired ones release it -> a new proposal).
  // QA2-05: an explicit key is scoped to the submitter (session user id, or the HMAC of the
  // IP when there is no session), so someone else's key never swallows a new proposal.
  const day = new Date(c.get('deps').now()).toISOString().slice(0, 10);
  const user = c.get('user');
  const fingerprint = await subjectHash(c.env.RSVP_DEVICE_SECRET, clientIp(c));
  const submitter = user ? `u:${user.id}` : `f:${fingerprint}`;
  const idemSource = input.idempotency_key
    ? `key:${submitter}|${input.idempotency_key}`
    : `content:${day}|${input.territory_id}|${input.join_url_proposed}|${input.proposer_email}`;
  const result = await repo.createGroupProposal({
    territory_id: input.territory_id,
    name: sanitizePlainText(input.name_proposed, 80),
    join_url: input.join_url_proposed,
    proposer_name: sanitizePlainText(input.proposer_name, 120),
    proposer_email: input.proposer_email,
    proposer_phone: phone,
    proposer_user_id: user && !user.is_anonymous ? user.id : null,
    consent_version: input.consent_version,
    idempotency_hash: await sha256Hex(idemSource),
    idempotency_ttl_seconds: IDEMPOTENCY_TTL_SECONDS,
    fingerprint_hash: fingerprint,
  });
  // Never reveal moderation state of someone else's proposal: always "pending" to the public.
  return ok(c, { id: result.id, status: 'pending' as const }, result.created ? 201 : 200);
});
