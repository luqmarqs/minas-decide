import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/Badge';
import { LoadingBlock } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { ApiClientError, messageForError } from '@/lib/api';
import { ActivityCard } from './ActivityCard';
import { ActivityRow } from './ActivityRow';
import { useActivities } from './api';

export interface ActivityAgendaProps {
  territoryId?: string | null;
  limit?: number;
  compact?: boolean;
  emptyAction?: ReactNode;
  /** Text used when no activity is published in the area. */
  emptyTitle?: string;
  /**
   * `card` (default): cartões compactos (painel, página do território, lista alternativa).
   * `row`: lista editorial da home — linhas separadas por filete, 2 colunas em tablet.
   */
  variant?: 'card' | 'row';
}

/** Agenda list (accessible alternative to the map's activity layer). */
export function ActivityAgenda({
  territoryId,
  limit,
  compact,
  emptyAction,
  emptyTitle,
  variant = 'card',
}: ActivityAgendaProps) {
  const q = useActivities({ territoryId: territoryId ?? null });

  if (q.isLoading) return <LoadingBlock label="Carregando agenda…" lines={3} />;
  if (q.error) {
    const unavailable = q.error instanceof ApiClientError && q.error.isUnavailable;
    return (
      <ErrorState
        compact
        title="Agenda indisponível"
        message={
          unavailable
            ? 'Não conseguimos consultar a agenda de atividades agora. O mapa e os dados eleitorais continuam disponíveis.'
            : messageForError(q.error)
        }
        requestId={q.error instanceof ApiClientError ? q.error.requestId : undefined}
        onRetry={() => void q.refetch()}
        retrying={q.isFetching}
      />
    );
  }
  const items = (q.data?.items ?? []).slice(0, limit ?? 50);
  if (items.length === 0) {
    return (
      <EmptyState
        title={emptyTitle ?? 'Nenhuma atividade publicada por aqui ainda'}
        description="Atividades aparecem depois de revisadas pela equipe."
        action={emptyAction}
      />
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {q.data?.demo ? (
        <p className="flex flex-wrap items-center gap-2 text-sm text-secondary">
          <Badge variant="demo">Demonstração</Badge>A agenda real não respondeu; exibindo atividades
          fictícias apenas para demonstrar a interface.
        </p>
      ) : null}
      {variant === 'row' ? (
        <ul
          data-testid="agenda-rows"
          className="grid grid-cols-1 gap-x-8 border-b border-border md:grid-cols-2 lg:grid-cols-1"
        >
          {items.map((a) => (
            <li key={a.id} className="flex flex-col">
              <hr className="ed-rule" aria-hidden="true" />
              <ActivityRow activity={a} demo={q.data?.demo} className="flex-1" />
            </li>
          ))}
        </ul>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((a) => (
            <li key={a.id}>
              <ActivityCard activity={a} demo={q.data?.demo} compact={compact} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
