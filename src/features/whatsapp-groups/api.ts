import { GroupProposalResult, type GroupProposalInput } from '@shared/contracts/groups.ts';
import { apiRequest } from '@/lib/api';
import { authedRequest, getCurrentSession } from '@/lib/auth';

/**
 * POST /groups/proposals. Session is optional: when present the token is sent so
 * a verified proposer is linked server-side; never required (spec §3.4).
 */
export async function submitGroupProposal(input: GroupProposalInput) {
  const session = await getCurrentSession();
  const opts = { method: 'POST' as const, body: input };
  return session
    ? authedRequest('/groups/proposals', GroupProposalResult, { ...opts, session })
    : apiRequest('/groups/proposals', GroupProposalResult, opts);
}
