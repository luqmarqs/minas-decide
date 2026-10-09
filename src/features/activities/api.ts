import { useQuery } from '@tanstack/react-query';
import { PublicActivity, RsvpState } from '@shared/contracts/activities.ts';
import { cursorPage } from '@shared/contracts/api.ts';
import { ApiClientError, apiRequest, idempotencyKey } from '@/lib/api';
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
