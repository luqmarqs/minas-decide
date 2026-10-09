import { useInfiniteQuery, useQuery, type InfiniteData } from '@tanstack/react-query';
import {
  MyActivity,
  PublicActivity,
  RsvpState,
  type ActivityInput,
  type ActivityPatch,
} from '@shared/contracts/activities.ts';
import { cursorPage } from '@shared/contracts/api.ts';
import { ApiClientError, apiRequest, idempotencyKey } from '@/lib/api';
import { authedRequest } from '@/lib/auth';
import { isDemoActivityId } from '@/fixtures/demoIds';
import { useSnapshot } from '@/features/electoral-map/hooks';

/** DEMO fixture is loaded on demand only (never in the main bundle). */
const loadDemoActivities = async () =>
  (await import('@/fixtures/activities-demo')).buildDemoActivities();

export const ActivitiesPage = cursorPage(PublicActivity);

export interface ActivitiesResult {
  items: PublicActivity[];
  /** true only when showing the labelled DEMO fixture (snapshot demo + API down). */
  demo: boolean;
}

export interface ActivitiesParams {
  territoryId?: string | null;
  bbox?: string | null;
  limit?: number;
}

function relatedTerritory(activityTerritory: string, selected: string): boolean {
  return (
    activityTerritory === selected ||
    activityTerritory.startsWith(`${selected}-`) ||
    selected.startsWith(`${activityTerritory}-`)
  );
}

export async function fetchActivities(params: ActivitiesParams, signal?: AbortSignal) {
  return apiRequest('/activities', ActivitiesPage, {
    query: {
      territory_id: params.territoryId ?? undefined,
      bbox: params.bbox ?? undefined,
      limit: params.limit ?? 50,
      from: new Date().toISOString(),
    },
    signal,
  });
}

export function useActivities(params: ActivitiesParams = {}) {
  const { data: snap } = useSnapshot();
  const allowDemo = snap?.mode === 'demo' || snap?.status === 'demo';
  return useQuery<ActivitiesResult>({
    queryKey: [
      'activities',
      params.territoryId ?? null,
      params.bbox ?? null,
      params.limit ?? 50,
      allowDemo,
    ],
    enabled: !!snap,
    staleTime: 60_000,
    retry: (count, err) => !(err instanceof ApiClientError && err.isUnavailable) && count < 1,
    queryFn: async ({ signal }) => {
      try {
        const page = await fetchActivities(params, signal);
        return { items: page.items, demo: false };
      } catch (err) {
        if (allowDemo && err instanceof ApiClientError && err.isUnavailable) {
          const items = (await loadDemoActivities()).filter(
            (a) => !params.territoryId || relatedTerritory(a.territory_id, params.territoryId),
          );
          return { items, demo: true };
        }
        throw err;
      }
    },
  });
}

export interface ActivityResult {
  activity: PublicActivity;
  demo: boolean;
}

export function useActivity(id: string | undefined) {
  return useQuery<ActivityResult>({
    queryKey: ['activity', id],
    enabled: !!id,
    staleTime: 30_000,
    retry: (count, err) =>
      !(err instanceof ApiClientError && (err.isUnavailable || err.code === 'NOT_FOUND')) &&
      count < 1,
    queryFn: async ({ signal }) => {
      if (id && isDemoActivityId(id)) {
        const demo = (await loadDemoActivities()).find((a) => a.id === id);
        if (demo) return { activity: demo, demo: true };
      }
      const activity = await apiRequest(`/activities/${encodeURIComponent(id!)}`, PublicActivity, {
        signal,
      });
      return { activity, demo: false };
    },
  });
}

/** POST (going=true) or DELETE (going=false) the anonymous RSVP. */
export function setRsvp(activityId: string, going: boolean) {
  return apiRequest(`/activities/${encodeURIComponent(activityId)}/rsvp`, RsvpState, {
    method: going ? 'POST' : 'DELETE',
    body: going ? { idempotency_key: idempotencyKey() } : undefined,
  });
}

// Local hint of the last server-confirmed RSVP state for this browser. The
// server cookie is the source of truth; this only restores the button label.
const RSVP_HINT_PREFIX = 'mm.rsvp.';

export function readRsvpHint(activityId: string): boolean {
  try {
    return window.localStorage.getItem(RSVP_HINT_PREFIX + activityId) === '1';
  } catch {
    return false;
  }
}

export function writeRsvpHint(activityId: string, going: boolean): void {
  try {
    if (going) window.localStorage.setItem(RSVP_HINT_PREFIX + activityId, '1');
    else window.localStorage.removeItem(RSVP_HINT_PREFIX + activityId);
  } catch {
    // storage unavailable: ignore
  }
}

// ---------------------------------------------------------------------------
// Organizer operations (verified e-mail required server-side). All go through the
// Worker with the session token; nothing is optimistic.
// ---------------------------------------------------------------------------

export const MyActivitiesPage = cursorPage(MyActivity);
export interface MyActivitiesPageData {
  items: MyActivity[];
  next_cursor: string | null;
}

export function createActivity(input: ActivityInput) {
  return authedRequest('/activities', MyActivity, { method: 'POST', body: input });
}

export function patchActivity(id: string, patch: ActivityPatch) {
  return authedRequest(`/activities/${encodeURIComponent(id)}`, MyActivity, {
    method: 'PATCH',
    body: patch,
  });
}

export function cancelActivity(id: string, version: number, reason?: string) {
  return authedRequest(`/activities/${encodeURIComponent(id)}/cancel`, MyActivity, {
    method: 'POST',
    body: reason ? { version, reason } : { version },
  });
}

export const myActivitiesKey = (userId: string | null) => ['my-activities', userId] as const;

/** Own activities (private: keyed by user, never shared between sessions). */
export function useMyActivities(userId: string | null) {
  return useInfiniteQuery<
    MyActivitiesPageData,
    Error,
    InfiniteData<MyActivitiesPageData>,
    ReturnType<typeof myActivitiesKey>,
    string | null
  >({
    queryKey: myActivitiesKey(userId),
    enabled: !!userId,
    staleTime: 0,
    gcTime: 0,
    retry: false,
    initialPageParam: null,
    getNextPageParam: (last) => last.next_cursor,
    queryFn: ({ pageParam, signal }): Promise<MyActivitiesPageData> =>
      authedRequest('/my-activities', MyActivitiesPage, {
        query: { limit: 20, cursor: pageParam ?? undefined },
        signal,
      }),
  });
}

/** Sensitive fields: editing them on a published activity sends it back to review. */
export const SENSITIVE_ACTIVITY_FIELDS = [
  'title',
  'description',
  'starts_at',
  'ends_at',
  'public_address',
  'coordinates',
  'territory_id',
] as const;

// --- Date/time in America/Sao_Paulo, without silent conversion -------------

function offsetMinutesAt(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(utcMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? '0');
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  return Math.round((asUtc - utcMs) / 60_000);
}

/**
 * "2026-10-12" + "14:30" in São Paulo → "2026-10-12T17:30:00.000Z". Uses the real
 * zone offset for that instant (no DST today, but never hard-coded). Returns null
 * for malformed input.
 */
export function saoPauloLocalToUtcIso(date: string, time: string): string | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const t = /^(\d{2}):(\d{2})$/.exec(time);
  if (!d || !t) return null;
  const [y, mo, da, h, mi] = [d[1], d[2], d[3], t[1], t[2]].map(Number) as [
    number,
    number,
    number,
    number,
    number,
  ];
  if (mo < 1 || mo > 12 || da < 1 || da > 31 || h > 23 || mi > 59) return null;
  const naive = Date.UTC(y, mo - 1, da, h, mi);
  let utc = naive - offsetMinutesAt(naive, 'America/Sao_Paulo') * 60_000;
  // Second pass settles instants next to an offset change.
  utc = naive - offsetMinutesAt(utc, 'America/Sao_Paulo') * 60_000;
  const check = new Date(utc);
  if (Number.isNaN(check.getTime())) return null;
  return check.toISOString();
}

/** ISO UTC → {date: "YYYY-MM-DD", time: "HH:mm"} in São Paulo (for editing). */
export function utcIsoToSaoPauloLocal(iso: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${get('hour')}:${get('minute')}`,
  };
}

/** UTC offset label for the instant, e.g. "UTC−3". */
export function saoPauloOffsetLabel(iso: string): string {
  const min = offsetMinutesAt(Date.parse(iso), 'America/Sao_Paulo');
  const sign = min < 0 ? '−' : '+';
  const abs = Math.abs(min);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `UTC${sign}${h}${m ? `:${String(m).padStart(2, '0')}` : ''}`;
}
