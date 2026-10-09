import type { ClerkUserInfo } from '../repositories/types.ts';

/**
 * QA3-01: in-memory, PER-ISOLATE cache of Clerk Backend API `users.getUser` results, so a
 * session token looping on `GET /me` does not cost one Backend API call per request.
 *
 * - TTL 60 s (a ban, a lock or a primary e-mail change in Clerk is seen within that window on
 *   cached routes; sensitive routes — registration, admin contact reveal — always read fresh);
 * - at most 500 entries, simple LRU (Map insertion order; a hit re-inserts the key);
 * - only positive lookups are cached (a 404 "user does not exist" is never cached);
 * - invalidated on account-changing routes (`PATCH /me`, `POST /registrations`, webhook
 *   `user.deleted`).
 * Isolates do not share it; it is a cost/availability optimisation, not a source of truth.
 */
export const USER_CACHE_TTL_MS = 60_000;
export const USER_CACHE_MAX_ENTRIES = 500;

export class UserInfoCache {
  private readonly entries = new Map<string, { info: ClerkUserInfo; expiresAt: number }>();

  constructor(
    private readonly ttlMs = USER_CACHE_TTL_MS,
    private readonly maxEntries = USER_CACHE_MAX_ENTRIES,
  ) {}

  get(userId: string, now: number): ClerkUserInfo | null {
    const hit = this.entries.get(userId);
    if (!hit) return null;
    this.entries.delete(userId);
    if (hit.expiresAt <= now) return null;
    this.entries.set(userId, hit); // most recently used goes last
    return hit.info;
  }

  set(userId: string, info: ClerkUserInfo, now: number): void {
    this.entries.delete(userId);
    this.entries.set(userId, { info: { ...info }, expiresAt: now + this.ttlMs });
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next();
      if (oldest.done) break;
      this.entries.delete(oldest.value);
    }
  }

  invalidate(userId: string): void {
    this.entries.delete(userId);
  }

  get size(): number {
    return this.entries.size;
  }
}
