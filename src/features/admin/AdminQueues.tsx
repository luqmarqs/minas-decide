import { useInfiniteQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import type { AdminActivity, AdminGroupProposal } from '@shared/contracts/admin.ts';
import { ACTIVITY_TYPE_LABEL_PT, ActivityType } from '@shared/contracts/activities.ts';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Select } from '@/components/ui/Select';
import { LoadingBlock } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { formatActivityWhen, formatDateNumeric, formatTime } from '@/lib/format';
import { useTerritoryName } from '@/features/registration/useTerritoryName';
import {
  ACTIVITY_STATUS_FILTERS,
  fetchActivityQueue,
  fetchGroupQueue,
  fetchSecurityEvents,
  findGroupForProposal,
  GROUP_STATUS_FILTERS,
  moderateActivity,
  moderateGroup,
  type ActivityQueue,
  type GroupQueue,
  type SecurityEventsPage,
} from './api';
import { adminErrorMessage } from './errors';
import { GroupManagement } from './GroupManagement';
import { ModerationDialog } from './ModerationDialog';

const when = (iso: string) => `${formatDateNumeric(iso)} ${formatTime(iso)}`;

function useAdminPages<T extends { next_cursor: string | null }>(
  key: readonly unknown[],
  fetchPage: (cursor: string | null, signal: AbortSignal) => Promise<T>,
) {
  return useInfiniteQuery<T, Error, InfiniteData<T>, readonly unknown[], string | null>({
    queryKey: key,
    staleTime: 0,
    gcTime: 0,
    retry: false,
    initialPageParam: null,
    getNextPageParam: (last) => last.next_cursor,
    queryFn: ({ pageParam, signal }) => fetchPage(pageParam, signal),
  });
}

function QueueState({ q, children }: { q: ReturnType<typeof useAdminPages>; children: ReactNode }) {
  if (q.isLoading) return <LoadingBlock label="Carregando fila…" lines={4} />;
  if (q.error) {
    return (
      <ErrorState
        title="Fila indisponível"
        message={adminErrorMessage(q.error)}
        onRetry={() => void q.refetch()}
        retrying={q.isFetching}
      />
    );
  }
  return (
    <>
      {children}
      {q.hasNextPage ? (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void q.fetchNextPage()}
          loading={q.isFetchingNextPage}
        >
          Carregar mais
        </Button>
      ) : null}
    </>
  );
}

function StatusFilter({
  id,
  value,
  onChange,
  options,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <Field label="Status" id={id} className="max-w-xs">
      {(p) => (
        <Select id={p.id} value={value} onValueChange={onChange} options={options} size="sm" />
      )}
    </Field>
  );
}

function Compare({ pub, priv }: { pub: ReactNode; priv: ReactNode }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <section className="rounded-md border border-border p-3" aria-label="O que fica público">
        <h4 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">
          Público (após aprovação)
        </h4>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">{pub}</dl>
      </section>
      <section
        className="rounded-md border border-warning/40 bg-warning-soft/40 p-3"
        aria-label="O que permanece privado"
      >
        <h4 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">
          Privado (só administração)
        </h4>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">{priv}</dl>
      </section>
    </div>
  );
}

function Row({ k, v }: { k: string; v: ReactNode }) {
  return (
    <>
      <dt className="font-medium text-secondary">{k}</dt>
      <dd className="min-w-0 break-words">{v}</dd>
    </>
  );
}

function TerritoryText({ id }: { id: string }) {
  const { label } = useTerritoryName(id);
  return (
    <>
      {label} <span className="font-mono text-xs text-muted">({id})</span>
    </>
  );
}

// ---------------------------------------------------------------- groups

export function GroupsQueue() {
  const [status, setStatus] = useState('pending');
  const [selected, setSelected] = useState<string | null>(null);
  const q = useAdminPages<GroupQueue>(['admin', 'groups', status], (c, s) =>
    fetchGroupQueue(status, c, s),
  );
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <div className="flex flex-col gap-4">
      <StatusFilter
        id="adm-group-status"
        value={status}
        onChange={(v) => {
          setStatus(v);
          setSelected(null);
        }}
        options={GROUP_STATUS_FILTERS}
      />
      <QueueState q={q as ReturnType<typeof useAdminPages>}>
        {items.length === 0 ? (
          <EmptyState title="Nenhuma proposta neste status." />
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
            {items.map((p) => (
              <li key={p.id} className="p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold">{p.name_proposed}</p>
                    <p className="text-sm text-muted">
                      <TerritoryText id={p.territory_id} /> · enviada {when(p.created_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={
                        p.status === 'pending'
                          ? 'warning'
                          : p.status === 'active'
                            ? 'success'
                            : 'neutral'
                      }
                    >
                      {p.status}
                    </Badge>
                    <Button
                      size="sm"
                      variant="secondary"
                      aria-expanded={selected === p.id}
                      onClick={() => setSelected(selected === p.id ? null : p.id)}
                    >
                      {selected === p.id ? 'Fechar' : 'Revisar'}
                    </Button>
                  </div>
                </div>
                {selected === p.id ? <GroupReview proposal={p} /> : null}
              </li>
            ))}
          </ul>
        )}
      </QueueState>
    </div>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return 'URL inválida';
  }
}

function GroupReview({ proposal: p }: { proposal: AdminGroupProposal }) {
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<'approve' | 'reject' | null>(null);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [lookup, setLookup] = useState<'idle' | 'loading' | 'missing' | 'error'>('idle');
  const host = hostOf(p.join_url_proposed);

  async function decide(reason: string) {
    const res = await moderateGroup(p.id, dialog!, reason);
    setDone(
      res.status === 'active'
        ? 'Proposta aprovada: o grupo está publicado.'
        : 'Proposta rejeitada.',
    );
    if (res.group_id) setGroupId(res.group_id);
    void queryClient.invalidateQueries({ queryKey: ['admin', 'groups'] });
  }

  async function openManagement() {
    setLookup('loading');
    try {
      const id = await findGroupForProposal(p);
      if (id) {
        setGroupId(id);
        setLookup('idle');
      } else setLookup('missing');
    } catch {
      setLookup('error');
    }
  }

  return (
    <div className="mt-3 flex flex-col gap-3">
      <Compare
        pub={
          <>
            <Row k="Nome" v={p.name_proposed} />
            <Row k="Território" v={<TerritoryText id={p.territory_id} />} />
            <Row
              k="Convite"
              v={
                <>
                  <span className="font-mono">{p.join_url_proposed}</span>{' '}
                  <span className="text-muted">({host})</span>
                </>
              }
            />
          </>
        }
        priv={
          <>
            <Row k="Proponente" v={p.proposer_name} />
            <Row k="E-mail" v={p.proposer_email_masked} />
            <Row k="WhatsApp" v={p.proposer_phone_masked} />
            <Row k="Enviada" v={when(p.created_at)} />
            {p.review_reason ? <Row k="Motivo" v={p.review_reason} /> : null}
          </>
        }
      />
      <p className="text-xs text-muted">
        Contatos chegam mascarados da API. Não há revelação nesta versão.
      </p>
      {done ? (
        <p role="status" className="text-sm font-medium">
          {done}
        </p>
      ) : null}
      {p.status === 'pending' && !done ? (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => setDialog('approve')}>
            Aprovar
          </Button>
          <Button size="sm" variant="danger" onClick={() => setDialog('reject')}>
            Rejeitar
          </Button>
        </div>
      ) : null}
      {p.status === 'active' && !groupId ? (
        <div className="flex flex-col gap-1">
          <div>
            <Button
              size="sm"
              variant="secondary"
              loading={lookup === 'loading'}
              onClick={() => void openManagement()}
            >
              Gerenciar grupo publicado
            </Button>
          </div>
          {lookup === 'missing' ? (
            <p className="text-sm text-warning">
              Grupo não encontrado entre os ativos deste território (pode estar inativo ou ter outro
              link).
            </p>
          ) : null}
          {lookup === 'error' ? (
            <p className="text-sm text-error">Não foi possível localizar o grupo agora.</p>
          ) : null}
        </div>
      ) : null}
      {groupId ? (
        <GroupManagement
          groupId={groupId}
          initialName={p.name_proposed}
          initialUrl={p.join_url_proposed}
        />
      ) : null}
      {dialog ? (
        <ModerationDialog
          open
          onOpenChange={(o) => !o && setDialog(null)}
          decision={dialog}
          subject={p.name_proposed}
          onConfirm={decide}
        />
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------ activities

export function ActivitiesQueue() {
  const [status, setStatus] = useState('pending_review');
  const [selected, setSelected] = useState<string | null>(null);
  const q = useAdminPages<ActivityQueue>(['admin', 'activities', status], (c, s) =>
    fetchActivityQueue(status, c, s),
  );
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <div className="flex flex-col gap-4">
      <StatusFilter
        id="adm-act-status"
        value={status}
        onChange={(v) => {
          setStatus(v);
          setSelected(null);
        }}
        options={ACTIVITY_STATUS_FILTERS}
      />
      <QueueState q={q as ReturnType<typeof useAdminPages>}>
        {items.length === 0 ? (
          <EmptyState title="Nenhuma atividade neste status." />
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
            {items.map((a) => (
              <li key={a.id} className="p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold">{a.title}</p>
                    <p className="text-sm text-muted">
                      <TerritoryText id={a.territory_id} /> · {formatActivityWhen(a.starts_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={
                        a.status === 'pending_review'
                          ? 'warning'
                          : a.status === 'published'
                            ? 'success'
                            : 'neutral'
                      }
                    >
                      {a.status}
                    </Badge>
                    <Button
                      size="sm"
                      variant="secondary"
                      aria-expanded={selected === a.id}
                      onClick={() => setSelected(selected === a.id ? null : a.id)}
                    >
                      {selected === a.id ? 'Fechar' : 'Revisar'}
                    </Button>
                  </div>
                </div>
                {selected === a.id ? <ActivityReview activity={a} /> : null}
              </li>
            ))}
          </ul>
        )}
      </QueueState>
    </div>
  );
}

function ActivityReview({ activity: a }: { activity: AdminActivity }) {
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<'approve' | 'reject' | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const typeLabel = ActivityType.safeParse(a.type).success
    ? ACTIVITY_TYPE_LABEL_PT[a.type as ActivityType]
    : a.type;

  async function decide(reason: string) {
    const res = await moderateActivity(a.id, dialog!, reason);
    setDone(
      res.status === 'published'
        ? 'Atividade publicada no mapa e na agenda.'
        : 'Atividade rejeitada.',
    );
    void queryClient.invalidateQueries({ queryKey: ['admin', 'activities'] });
  }

  return (
    <div className="mt-3 flex flex-col gap-3">
      <Compare
        pub={
          <>
            <Row k="Título" v={a.title} />
            <Row k="Tipo" v={typeLabel} />
            <Row k="Quando" v={formatActivityWhen(a.starts_at)} />
            <Row k="Endereço" v={a.public_address} />
            <Row k="Território" v={<TerritoryText id={a.territory_id} />} />
            <Row k="Descrição" v={<span className="whitespace-pre-line">{a.description}</span>} />
            <Row
              k="Contato público"
              v={a.public_contact_opt_in ? 'Sim (autor optou por exibir)' : 'Não'}
            />
          </>
        }
        priv={
          <>
            <Row
              k="Autor (id)"
              v={<span className="font-mono text-xs">{a.creator_user_id}</span>}
            />
            <Row k="Criada" v={when(a.created_at)} />
            <Row k="Versão" v={a.version} />
            {a.review_reason ? <Row k="Motivo" v={a.review_reason} /> : null}
          </>
        }
      />
      {done ? (
        <p role="status" className="text-sm font-medium">
          {done}
        </p>
      ) : null}
      {a.status === 'pending_review' && !done ? (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => setDialog('approve')}>
            Aprovar e publicar
          </Button>
          <Button size="sm" variant="danger" onClick={() => setDialog('reject')}>
            Rejeitar
          </Button>
        </div>
      ) : null}
      {dialog ? (
        <ModerationDialog
          open
          onOpenChange={(o) => !o && setDialog(null)}
          decision={dialog}
          subject={a.title}
          onConfirm={decide}
        />
      ) : null}
    </div>
  );
}

// -------------------------------------------------------- security events

export function SecurityEvents() {
  const q = useAdminPages<SecurityEventsPage>(['admin', 'security-events'], (c, s) =>
    fetchSecurityEvents(c, s),
  );
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <QueueState q={q as ReturnType<typeof useAdminPages>}>
      {items.length === 0 ? (
        <EmptyState title="Nenhum evento registrado." />
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Eventos de segurança (sem IP nem dados pessoais)</caption>
            <thead className="bg-surface-alt">
              <tr>
                <th scope="col" className="px-3 py-2">
                  Quando
                </th>
                <th scope="col" className="px-3 py-2">
                  Rota
                </th>
                <th scope="col" className="px-3 py-2">
                  Evento
                </th>
                <th scope="col" className="px-3 py-2">
                  Código
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((e) => (
                <tr key={e.id} className="border-t border-border">
                  <td className="px-3 py-2 whitespace-nowrap">{when(e.created_at)}</td>
                  <td className="px-3 py-2 font-mono">{e.route}</td>
                  <td className="px-3 py-2">{e.event_type}</td>
                  <td className="px-3 py-2 font-mono">{e.block_code ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </QueueState>
  );
}
