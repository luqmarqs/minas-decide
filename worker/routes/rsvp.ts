import { Hono, type Context } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { RsvpInput, type RsvpState } from '../../shared/contracts/activities.ts';
import type { AppBindings } from '../env.ts';
import { isLocal } from '../env.ts';
import { fail } from '../errors.ts';
import { readJson, ok, uuidParam } from '../http.ts';
import { optionalSession } from '../middleware/auth.ts';
import { noStore } from '../middleware/cache.ts';
import { rateLimit } from '../middleware/rate-limit.ts';
import { hmacSha256Hex, randomToken, sha256Hex } from '../services/crypto.ts';
import type { RsvpIdentity } from '../repositories/types.ts';

export const rsvp = new Hono<AppBindings>();

export const DEVICE_COOKIE = 'mm_device';
const DEVICE_RE = /^[A-Za-z0-9_-]{43}$/; // 32 random bytes, base64url without padding

function readDevice(c: Context<AppBindings>): string | null {
  const v = getCookie(c, DEVICE_COOKIE);
  return v && DEVICE_RE.test(v) ? v : null;
}

function issueDevice(c: Context<AppBindings>): string {
  const device = randomToken(32);
  setCookie(c, DEVICE_COOKIE, device, {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/api',
    maxAge: 31_536_000,
    secure: !isLocal(c.env),
  });
  return device;
}

/** Session user wins; otherwise the device cookie (HMAC'd server-side, never returned). */
async function identity(c: Context<AppBindings>, create: boolean): Promise<RsvpIdentity | null> {
  const user = c.get('user');
  if (user) return { user_id: user.id };
  let device = readDevice(c);
  if (!device && create) device = issueDevice(c);
  if (!device) return null;
  return { subject_hash: await hmacSha256Hex(c.env.RSVP_DEVICE_SECRET, `device:${device}`) };
}

rsvp.post('/activities/:id/rsvp', noStore, rateLimit('rsvp'), optionalSession, async (c) => {
  const activityId = uuidParam(c);
  const input = RsvpInput.parse(await readJson(c, true));
  const who = await identity(c, true);
  if (!who) throw fail('FORBIDDEN');
  const idem = input.idempotency_key ? await sha256Hex(`rsvp:${input.idempotency_key}`) : null;
  const res = await c.get('deps').repo.upsertRsvp(activityId, who, true, idem);
  const body: RsvpState = { activity_id: activityId, going: res.going, rsvp_count_approx: res.rsvp_count };
  return ok(c, body);
});

rsvp.delete('/activities/:id/rsvp', noStore, rateLimit('rsvp'), optionalSession, async (c) => {
  const activityId = uuidParam(c);
  const who = await identity(c, false);
  // No session and no device cookie: nothing this caller could own (T11).
  if (!who) throw fail('FORBIDDEN');
  const res = await c.get('deps').repo.upsertRsvp(activityId, who, false, null);
  const body: RsvpState = { activity_id: activityId, going: res.going, rsvp_count_approx: res.rsvp_count };
  return ok(c, body);
});
