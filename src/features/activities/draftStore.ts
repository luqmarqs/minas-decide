/**
 * Activity draft persistence (P-UX-1): localStorage, one key per user, 7-day TTL.
 * Survives the e-mail-verification detour even when the magic link opens in a new
 * tab. Only what the person typed is stored (no tokens, no server data); expired
 * drafts are purged on read.
 */
export const DRAFT_PREFIX = 'mm.activity-draft:';
export const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface Stored<T> {
  v: 1;
  savedAt: number;
  data: T;
}

export const draftKey = (userId: string) => `${DRAFT_PREFIX}${userId}`;

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Removes every expired (or unreadable) draft, whatever the user. */
export function purgeExpiredDrafts(now = Date.now()): void {
  const ls = storage();
  if (!ls) return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < ls.length; i++) {
      const k = ls.key(i);
      if (k?.startsWith(DRAFT_PREFIX)) keys.push(k);
    }
    for (const k of keys) {
      const raw = ls.getItem(k);
      let ok = false;
      try {
        const s = JSON.parse(raw ?? '') as Partial<Stored<unknown>>;
        ok = s?.v === 1 && typeof s.savedAt === 'number' && now - s.savedAt < DRAFT_TTL_MS;
      } catch {
        ok = false;
      }
      if (!ok) ls.removeItem(k);
    }
  } catch {
    // storage unavailable
  }
}

export function readDraft<T>(userId: string, now = Date.now()): T | null {
  purgeExpiredDrafts(now);
  const ls = storage();
  if (!ls) return null;
  try {
    const raw = ls.getItem(draftKey(userId));
    if (!raw) return null;
    const s = JSON.parse(raw) as Stored<T>;
    return s.data ?? null;
  } catch {
    return null;
  }
}

export function writeDraft<T>(userId: string, data: T | null, now = Date.now()): void {
  const ls = storage();
  if (!ls) return;
  try {
    if (data === null) ls.removeItem(draftKey(userId));
    else ls.setItem(draftKey(userId), JSON.stringify({ v: 1, savedAt: now, data }));
  } catch {
    // quota/unavailable: the draft just isn't kept
  }
}
