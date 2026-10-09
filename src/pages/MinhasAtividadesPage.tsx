import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import {
  ACTIVITY_TYPE_LABEL_PT,
  type ActivityStatus,
  type MyActivity,
} from '@shared/contracts/activities.ts';
import { PageShell } from '@/components/layouts/PageShell';
import { Badge, type BadgeVariant } from '@/components/ui/Badge';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Dialog, DialogContent } from '@/components/ui/Dialog';
import { LoadingBlock } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState, Note } from '@/components/ui/States';
import { ApiClientError, messageForError } from '@/lib/api';
import { formatActivityWhen, plural } from '@/lib/format';
import { useMe, useSession } from '@/lib/auth';
import { ActivityEditor } from '@/features/activities/ActivityEditor';
import { cancelActivity, myActivitiesKey, useMyActivities } from '@/features/activities/api';
import { SendLinkForm } from '@/features/auth/SendLinkForm';
import { submitErrorMessage } from '@/features/registration/formErrors';

const STATUS: Record<ActivityStatus, { label: string; variant: BadgeVariant }> = {
  draft: { label: 'Rascunho', variant: 'neutral' },
  pending_review: { label: 'Em análise', variant: 'warning' },
  published: { label: 'Publicada', variant: 'success' },
  rejected: { label: 'Não aprovada', variant: 'error' },
  cancelled: { label: 'Cancelada', variant: 'neutral' },
  archived: { label: 'Arquivada', variant: 'neutral' },
};

const MANAGEABLE = new Set<ActivityStatus>(['draft', 'pending_review', 'published']);

export default function MinhasAtividadesPage() {
  const session = useSession();
  const active = session.status === 'active' ? session.session : null;
  const me = useMe(active);
  const verified = !!me.data?.email_verified;

  let body;
  if (session.status === 'loading' || (active && me.isLoading)) {
    body = <LoadingBlock label="Verificando sua sessão…" lines={3} />;
  } else if (session.status === 'unconfigured') {
    body = <Note tone="warning">Login não configurado neste ambiente.</Note>;
  } else if (!active) {
    body = (
      <div className="flex flex-col gap-6">
        <Note>Entre com o link enviado por e-mail para ver as atividades que você propôs.</Note>
        <SendLinkForm idPrefix="minhas-link" next="/minhas-atividades" title="Entrar por e-mail" />
      </div>
    );
  } else if (me.error) {
    body = (
      <ErrorState
        message={messageForError(me.error)}
        onRetry={() => void me.refetch()}
        retrying={me.isFetching}
      />
    );
  } else if (!verified) {
    body = (
      <div className="flex flex-col gap-6">
        <Note tone="warning">
          Sua sessão é provisória: confirme o e-mail pelo link enviado para propor e acompanhar
          atividades.
        </Note>
        <SendLinkForm idPrefix="minhas-link" next="/minhas-atividades" title="Reenviar link" />
      </div>
    );
  } else {
    body = <MyActivityList userId={active.user.id} />;
  }

  return (
    <PageShell
      title="Minhas atividades"
      lead="As atividades que você propôs e o status de revisão de cada uma."
    >
      {body}
    </PageShell>
  );
}

function MyActivityList({ userId }: { userId: string }) {
  const q = useMyActivities(userId);
  if (q.isLoading) return <LoadingBlock label="Carregando suas atividades…" lines={4} />;
  if (q.error) {
    const notVerified = q.error instanceof ApiClientError && q.error.code === 'EMAIL_NOT_VERIFIED';
    return (
      <ErrorState
        title={notVerified ? 'E-mail não verificado' : 'Não foi possível carregar'}
        message={messageForError(q.error)}
        onRetry={() => void q.refetch()}
        retrying={q.isFetching}
      />
    );
  }
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  if (items.length === 0) {
    return (
      <EmptyState
        title="Você ainda não propôs atividades"
        action={<ButtonLink to="/criar-atividade">Organizar uma atividade</ButtonLink>}
      />
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <div>
        <ButtonLink to="/criar-atividade" variant="secondary" size="sm">
          Nova atividade
        </ButtonLink>
      </div>
      <ul className="flex flex-col gap-4" aria-label="Suas atividades">
        {items.map((a) => (
          <MyActivityItem key={a.id} activity={a} userId={userId} />
        ))}
      </ul>
      {q.hasNextPage ? (
        <div>
          <Button
            variant="secondary"
            onClick={() => void q.fetchNextPage()}
            loading={q.isFetchingNextPage}
          >
            Carregar mais
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function MyActivityItem({ activity: a, userId }: { activity: MyActivity; userId: string }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const status = STATUS[a.status];
  const manageable = MANAGEABLE.has(a.status);
  const refresh = () => queryClient.invalidateQueries({ queryKey: myActivitiesKey(userId) });

  async function doCancel() {
    setCancelling(true);
    try {
      await cancelActivity(a.id, a.version);
      setConfirmCancel(false);
      setMessage({ tone: 'ok', text: 'Atividade cancelada.' });
      await refresh();
    } catch (err) {
      setMessage({ tone: 'error', text: submitErrorMessage(err) });
      setConfirmCancel(false);
    } finally {
      setCancelling(false);
    }
  }

  return (
    <li className="rounded-md border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-body text-lg font-semibold tracking-normal">{a.title}</h2>
          <p className="text-sm text-secondary">
            {ACTIVITY_TYPE_LABEL_PT[a.type]} · {formatActivityWhen(a.starts_at, a.ends_at)}
          </p>
          <p className="text-sm text-muted">{a.location_public}</p>
        </div>
        <Badge variant={status.variant}>{status.label}</Badge>
      </div>
      {a.status === 'pending_review' ? (
        <p className="mt-2 text-sm text-secondary">
          Aguardando revisão. Ainda não aparece no mapa.
        </p>
      ) : null}
      {a.status === 'rejected' && a.review_reason ? (
        <p className="mt-2 text-sm">
          <strong>Motivo:</strong> {a.review_reason}
        </p>
      ) : null}
      {a.status === 'published' ? (
        <p className="mt-2 text-sm text-secondary">
          {plural(a.rsvp_count_approx, 'intenção', 'intenções')} de ir (aproximado, não é presença
          confirmada).
        </p>
      ) : null}
      {message ? (
        <p
          role={message.tone === 'error' ? 'alert' : 'status'}
          className={message.tone === 'error' ? 'mt-2 text-sm text-error' : 'mt-2 text-sm'}
        >
          {message.text}
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {a.status === 'published' || a.status === 'cancelled' ? (
          <Link
            to={`/atividade/${a.id}`}
            className="inline-flex min-h-11 items-center text-sm underline"
          >
            Ver página pública
          </Link>
        ) : null}
        {manageable && !editing ? (
          <>
            <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
              Editar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmCancel(true)}>
              Cancelar atividade
            </Button>
          </>
        ) : null}
      </div>
      {editing ? (
        <div className="mt-4 border-t border-border pt-4">
          <ActivityEditor
            mode="edit"
            initial={a}
            onCancel={() => setEditing(false)}
            onSaved={(saved) => {
              setEditing(false);
              setMessage({
                tone: 'ok',
                text:
                  saved.status === 'pending_review' && a.status === 'published'
                    ? 'Alterações salvas. A atividade voltou para análise e saiu do mapa até nova aprovação.'
                    : 'Alterações salvas.',
              });
              void refresh();
            }}
          />
        </div>
      ) : null}
      <Dialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <DialogContent
          title="Cancelar esta atividade?"
          description="Se já estava publicada, continua visível como cancelada para quem marcou intenção de ir. Não dá para desfazer."
        >
          <div className="flex flex-wrap gap-2">
            <Button variant="danger" loading={cancelling} onClick={() => void doCancel()}>
              Sim, cancelar atividade
            </Button>
            <Button variant="ghost" onClick={() => setConfirmCancel(false)}>
              Voltar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </li>
  );
}
