import { Link } from 'react-router';
import { ACTIVITY_TYPE_LABEL_PT, type PublicActivity } from '@shared/contracts/activities.ts';
import { Badge } from '@/components/ui/Badge';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/cn';
import { formatDateShort, formatTime } from '@/lib/format';
import { ActivityMarker } from './ActivityMarker';
import { ActivityShare } from './ActivityShare';

export interface ActivityRowProps {
  activity: PublicActivity;
  demo?: boolean;
  className?: string;
}

/**
 * Agenda da home como lista editorial (redesign 2026-10, D12): uma linha por atividade —
 * coluna de data (dia grande + mês/hora em kicker), tipo, título, local e o compartilhar à
 * direita. Sem caixa nem sombra: o separador é o filete (`.ed-rule`) do item na lista. No
 * celular a data fica acima do título. Mesmo conteúdo e mesmos links do `ActivityCard`.
 */
export function ActivityRow({ activity, demo, className }: ActivityRowProps) {
  const cancelled = activity.status === 'cancelled';
  const [day = '—', month = ''] = formatDateShort(activity.starts_at).split(' ');
  const showShare = !demo && !cancelled;
  return (
    <article
      data-testid="activity-row"
      className={cn(
        'group relative grid grid-cols-1 gap-x-5 gap-y-2 py-4 text-primary',
        'sm:grid-cols-[4.5rem_minmax(0,1fr)]',
        'lg:grid-cols-[5rem_minmax(0,1fr)_auto] lg:items-center',
        className,
      )}
    >
      <time
        dateTime={activity.starts_at}
        className="flex items-baseline gap-2 sm:flex-col sm:items-start sm:gap-1"
      >
        <span className="ed-figure text-3xl sm:text-5xl">{day}</span>
        <span className="ed-kicker whitespace-nowrap">
          {month} <span className="sm:hidden">·</span>{' '}
          <span className="sm:mt-0.5 sm:block">{formatTime(activity.starts_at)}</span>
        </span>
      </time>
      <div className="min-w-0">
        <p className="mb-1 flex flex-wrap items-center gap-1.5">
          <ActivityMarker size={10} />
          <span className="ed-kicker">{ACTIVITY_TYPE_LABEL_PT[activity.type]}</span>
          {cancelled ? <Badge variant="error">Cancelada</Badge> : null}
          {demo ? <Badge variant="demo">Demonstrativa</Badge> : null}
        </p>
        <h3
          className={cn(
            'font-body text-lg leading-snug font-semibold tracking-normal text-balance',
            cancelled && 'line-through decoration-1',
          )}
        >
          <Link
            to={`/atividade/${activity.id}`}
            className="no-underline decoration-2 underline-offset-4 after:absolute after:inset-0 after:content-[''] group-hover:underline"
          >
            {activity.title}
          </Link>
        </h3>
        <p className="mt-1 flex items-start gap-1 text-sm text-secondary">
          <Icon name="pin" size={16} className="mt-0.5 shrink-0" />
          <span className="min-w-0 break-words">{activity.location_public}</span>
        </p>
      </div>
      {showShare ? (
        // Above the row's stretched link so it stays clickable.
        <ActivityShare
          activity={activity}
          className="relative z-10 sm:col-start-2 lg:col-start-3 lg:justify-self-end"
        />
      ) : null}
    </article>
  );
}
