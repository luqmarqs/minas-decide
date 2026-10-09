import type { PublicActivity } from '@shared/contracts/activities.ts';

/**
 * Why "Eu vou" is unavailable for an activity (null = available). Shared by the
 * activity page and the map popover so both apply the same rules.
 */
export function rsvpDisabledReason(
  activity: Pick<PublicActivity, 'status' | 'starts_at' | 'ends_at'>,
  demo: boolean | undefined,
  now: number,
): string | null {
  if (demo) return 'Indisponível: esta é uma atividade demonstrativa, não um evento real.';
  if (activity.status === 'cancelled') return 'Esta atividade foi cancelada.';
  const end = new Date(activity.ends_at ?? activity.starts_at).getTime();
  if (Number.isFinite(end) && end < now) return 'Esta atividade já aconteceu.';
  return null;
}
