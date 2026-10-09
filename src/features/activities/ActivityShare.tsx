import type { PublicActivity } from '@shared/contracts/activities.ts';
import { WhatsAppShare } from '@/components/ui/WhatsAppShare';
import { activityShareText, absoluteUrl } from '@/lib/share';
import { useTerritoryIndex } from '@/features/electoral-map/hooks';
import { territoryLabel } from '@/features/territory/search';

/**
 * "Compartilhar no WhatsApp" for an activity (D26). The neighborhood/city label is read
 * passively from the territories index when another component already loaded it; it is
 * omitted otherwise (the message never waits for a 2 MB download).
 */
export function ActivityShare({
  activity,
  className,
  withCopy = false,
}: {
  activity: PublicActivity;
  className?: string;
  withCopy?: boolean;
}) {
  const { index } = useTerritoryIndex({ enabled: false });
  const entry = index?.byId.get(activity.territory_id);
  return (
    <WhatsAppShare
      className={className}
      text={activityShareText({ ...activity, placeLabel: entry ? territoryLabel(entry) : null })}
      copyUrl={withCopy ? absoluteUrl(`/atividade/${activity.id}`) : undefined}
    />
  );
}
