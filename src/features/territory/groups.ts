import { useQuery } from '@tanstack/react-query';
import { PublicGroupsResponse } from '@shared/contracts/groups.ts';
import { ApiClientError, apiRequest } from '@/lib/api';

/** Approved public groups for a territory (with municipal fallback decided by the API). */
export function useGroups(territoryId: string | null) {
  return useQuery({
    queryKey: ['groups', territoryId],
    enabled: !!territoryId && territoryId !== 'mg',
    staleTime: 60_000,
    retry: (count, err) => !(err instanceof ApiClientError && err.isUnavailable) && count < 1,
    queryFn: ({ signal }) =>
      apiRequest('/groups', PublicGroupsResponse, { query: { territory_id: territoryId }, signal }),
  });
}
