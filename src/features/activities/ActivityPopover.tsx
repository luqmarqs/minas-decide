import { useState } from 'react';
import { Link } from 'react-router';
import { ACTIVITY_TYPE_LABEL_PT, type PublicActivity } from '@shared/contracts/activities.ts';
import { Badge } from '@/components/ui/Badge';
import { Icon } from '@/components/ui/Icon';
import { formatActivityWhen } from '@/lib/format';
import { MapPopover } from '@/features/electoral-map/MapPopover';
import { ActivityMarker } from './ActivityMarker';
import { ActivityShare } from './ActivityShare';
import { RSVPButton } from './RSVPButton';
import { rsvpDisabledReason } from './rsvpState';

export interface ActivityPopoverProps {
  activity: PublicActivity;
  demo?: boolean;
  onClose: () => void;
  className?: string;
}

/**
 * Map popover of an activity (rodada 3): title, date/time (Brasília), place and the
 * "Eu vou" button right there — same RSVP rules as the activity page (server
 * confirmation before success; intention, not attendance).
 */
export function ActivityPopover({ activity: a, demo, onClose, className }: ActivityPopoverProps) {
  const [now] = useState(() => Date.now());
  const disabledReason = rsvpDisabledReason(a, demo, now);
  return (
    <MapPopover
      testId="activity-popover"
      className={className}
      onClose={onClose}
      closeLabel="Fechar atividade"
      eyebrow={
        <>
          <ActivityMarker size={10} />
          <span className="text-xs font-semibold text-secondary">
            {ACTIVITY_TYPE_LABEL_PT[a.type]} · mobilização da campanha
          </span>
          {a.status === 'cancelled' ? <Badge variant="error">Cancelada</Badge> : null}
          {demo ? <Badge variant="demo">Demonstrativa</Badge> : null}
        </>
      }
      title={
        <Link to={`/atividade/${a.id}`} className="underline-offset-2 hover:underline">
          {a.title}
        </Link>
      }
    >
      <p className="flex items-start gap-1.5 text-secondary">
        <Icon name="calendar" size={16} className="mt-0.5 shrink-0" />
        <span>{formatActivityWhen(a.starts_at, a.ends_at)}</span>
      </p>
      <p className="flex items-start gap-1.5 text-secondary">
        <Icon name="pin" size={16} className="mt-0.5 shrink-0" />
        <span className="min-w-0 break-words">{a.location_public}</span>
      </p>
      <RSVPButton
        compact
        activityId={a.id}
        initialCount={a.rsvp_count_approx}
        disabledReason={disabledReason}
      />
      <div className="flex flex-wrap items-center gap-x-3">
        <ActivityShare activity={a} />
        <Link
          to={`/atividade/${a.id}`}
          className="inline-flex min-h-11 items-center text-sm font-semibold underline"
        >
          Ver detalhes
        </Link>
      </div>
    </MapPopover>
  );
}
