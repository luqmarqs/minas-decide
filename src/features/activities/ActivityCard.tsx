import { Link } from 'react-router';
import { ACTIVITY_TYPE_LABEL_PT, type PublicActivity } from '@shared/contracts/activities.ts';
import { Badge } from '@/components/ui/Badge';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/cn';
import { formatDateShort, formatTime } from '@/lib/format';
import { ActivityMarker } from './ActivityMarker';
import { ActivityShare } from './ActivityShare';

export interface ActivityCardProps {
  activity: PublicActivity;
  demo?: boolean;
  compact?: boolean;
  className?: string;
}

export function ActivityCard({ activity, demo, compact, className }: ActivityCardProps) {
  const cancelled = activity.status === 'cancelled';
  return (
    <article
      className={cn(
        // FE-10: tighter on phones (agenda compacta); same content.
        'group relative flex gap-2.5 rounded-md border border-border bg-surface-raised p-2.5 text-primary sm:gap-3 sm:p-3',
        'transition-colors duration-(--duration-fast) ease-(--easing-standard) hover:border-action',
        className,
      )}
    >
      <div className="flex w-12 shrink-0 flex-col items-center justify-center rounded-sm bg-surface-alt py-1 text-center sm:w-14">
        <span className="text-xs font-semibold uppercase text-muted">
          {formatDateShort(activity.starts_at).split(' ')[1]}
        </span>
        <span className="font-display text-xl leading-none font-(--heading-weight)">
          {formatDateShort(activity.starts_at).split(' ')[0]}
        </span>
        <span className="text-xs text-secondary">{formatTime(activity.starts_at)}</span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-1.5">
          <ActivityMarker size={10} />
          <span className="text-xs font-semibold text-secondary">
            {ACTIVITY_TYPE_LABEL_PT[activity.type]}
          </span>
          {cancelled ? <Badge variant="error">Cancelada</Badge> : null}
          {demo ? <Badge variant="demo">Demonstrativa</Badge> : null}
        </div>
        <h3
          className={cn(
            'font-body text-base font-semibold tracking-normal',
            cancelled && 'line-through decoration-1',
          )}
        >
          <Link
            to={`/atividade/${activity.id}`}
            className="no-underline after:absolute after:inset-0 after:content-[''] hover:underline focus-visible:outline-none"
          >
            {activity.title}
          </Link>
        </h3>
        {!compact ? (
          <p className="mt-0.5 flex items-start gap-1 text-sm text-secondary">
            <Icon name="pin" size={16} className="mt-0.5 shrink-0" />
            <span className="min-w-0 break-words">{activity.location_public}</span>
          </p>
        ) : null}
        {!compact && !demo && !cancelled ? (
          // Above the card's stretched link so it stays clickable.
          <ActivityShare activity={activity} className="relative z-10 mt-2" />
        ) : null}
      </div>
    </article>
  );
}
