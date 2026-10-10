import { useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { AdminGrantInput, type AdminListItem } from '@shared/contracts/admin.ts';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Dialog, DialogContent } from '@/components/ui/Dialog';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { LoadingBlock } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState } from '@/components/ui/States';
import { formatDateNumeric, formatTime } from '@/lib/format';
import { serverFieldErrors } from '@/features/registration/formErrors';
import { fetchAdmins, grantAdmin, revokeAdmin } from './api';
import { adminAccessErrorMessage, adminErrorMessage } from './errors';

const when = (iso: string) => `${formatDateNumeric(iso)} ${formatTime(iso)}`;

type Notice = { tone: 'ok' | 'error'; text: string } | null;

/**
 * "Administradores": lists, adds and removes admins. Every change is decided by the server
 * (fresh admin check, audited); success is only shown after its answer. E-mails come masked.
 */
export function AdminManagement() {
  const q = useQuery({
    queryKey: ['admin', 'admins'],
    queryFn: ({ signal }) => fetchAdmins(signal),
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
  const [notice, setNotice] = useState<Notice>(null);

  if (q.isLoading) return <LoadingBlock label="Carregando administradores…" lines={3} />;
  if (q.error) {
    return (
      <ErrorState
        title="Lista indisponível"
        message={adminErrorMessage(q.error)}
        onRetry={() => void q.refetch()}
        retrying={q.isFetching}
      />
    );
  }
  const items = q.data?.items ?? [];

  return (
    <div className="flex flex-col gap-6">
      <p aria-live="polite" role="status">
        {notice ? (
          <span className={notice.tone === 'ok' ? 'text-success' : 'text-error'}>
            {notice.text}
          </span>
        ) : null}
      </p>
      <section aria-labelledby="admins-list-title" className="flex flex-col gap-3">
        <h2 id="admins-list-title" className="font-body text-lg font-semibold tracking-normal">
          Administradores atuais
        </h2>
        <div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void q.refetch()}
            loading={q.isFetching}
            loadingText="Atualizando…"
          >
            Atualizar lista
          </Button>
        </div>
        {items.length === 0 ? (
          <EmptyState title="Nenhum administrador listado." />
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
            {items.map((a) => (
              <AdminRow
                key={a.user_id}
                item={a}
                onDone={(text) => {
                  setNotice({ tone: 'ok', text });
                  void q.refetch();
                }}
                onFail={(text) => setNotice({ tone: 'error', text })}
              />
            ))}
          </ul>
        )}
      </section>
      <AddAdminForm
        onDone={(text) => {
          setNotice({ tone: 'ok', text });
          void q.refetch();
        }}
      />
    </div>
  );
}

function AdminRow({
  item,
  onDone,
  onFail,
}: {
  item: AdminListItem;
  onDone: (text: string) => void;
  onFail: (text: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const label = item.email_masked ?? 'conta removida do Clerk';

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await revokeAdmin(item.user_id);
      setConfirming(false);
      onDone(`Acesso de ${label} removido. A ação foi registrada na auditoria.`);
    } catch (err) {
      const text = adminAccessErrorMessage(err, 'revoke');
      setError(text);
      onFail(text);
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-2 font-medium break-all">
          <span>{label}</span>
          {item.is_self ? <Badge variant="info">você</Badge> : null}
          {item.status === 'missing' ? <Badge variant="warning">sem usuário no Clerk</Badge> : null}
        </p>
        <p className="text-sm text-muted">
          Desde {when(item.created_at)}
          {item.created_by_masked ? ` · adicionado por ${item.created_by_masked}` : ''}
        </p>
      </div>
      <div>
        <Button
          size="sm"
          variant="secondary"
          disabled={item.is_self}
          aria-describedby={item.is_self ? `self-${item.user_id}` : undefined}
          onClick={() => setConfirming(true)}
        >
          Remover
          <span className="sr-only"> {label}</span>
        </Button>
        {item.is_self ? (
          <p id={`self-${item.user_id}`} className="mt-1 text-xs text-muted">
            Você não pode remover o próprio acesso.
          </p>
        ) : null}
      </div>
      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent
          title="Remover administrador?"
          description={`${label} perderá o acesso à moderação e aos contatos. A remoção fica registrada na auditoria. Não é possível remover o último administrador.`}
        >
          {error ? (
            <p role="alert" className="mb-3 text-sm text-error">
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button loading={busy} loadingText="Removendo…" onClick={() => void remove()}>
              Remover e registrar
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Cancelar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </li>
  );
}

function AddAdminForm({ onDone }: { onDone: (text: string) => void }) {
  const [email, setEmail] = useState('');
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const parsed = AdminGrantInput.safeParse({ email });
    if (!parsed.success) {
      setFieldError('Informe um e-mail válido.');
      document.getElementById('admin-add-email')?.focus();
      return;
    }
    setFieldError(undefined);
    setConfirming(true); // nothing is sent before the explicit confirmation
  }

  async function confirm() {
    const parsed = AdminGrantInput.safeParse({ email });
    if (!parsed.success) return;
    setBusy(true);
    setFormError(null);
    try {
      const r = await grantAdmin(parsed.data.email);
      setConfirming(false);
      setEmail('');
      setFieldError(undefined);
      onDone(
        r.created
          ? `${r.email_masked} agora é administrador. A concessão foi registrada na auditoria.`
          : `${r.email_masked} já era administrador. Nada foi alterado.`,
      );
    } catch (err) {
      setConfirming(false);
      setFieldError(serverFieldErrors(err).email);
      setFormError(adminAccessErrorMessage(err, 'grant'));
      document.getElementById('admin-add-email')?.focus();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="admins-add-title">
      <form
        noValidate
        onSubmit={onSubmit}
        className="flex flex-col gap-3 rounded-md border border-border p-4"
      >
        <h2 id="admins-add-title" className="font-body text-lg font-semibold tracking-normal">
          Adicionar administrador
        </h2>
        <p className="text-sm text-secondary">
          A pessoa precisa já ter conta criada em /participar, com o e-mail verificado.
          Administradores têm acesso total à moderação e aos contatos.
        </p>
        <Field label="E-mail da pessoa" required id="admin-add-email" error={fieldError}>
          {(p) => (
            <Input
              {...p}
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              maxLength={254}
              onChange={(e) => setEmail(e.target.value)}
            />
          )}
        </Field>
        {formError ? (
          <p role="alert" className="text-sm text-error">
            {formError}
          </p>
        ) : null}
        <div>
          <Button type="submit">Adicionar administrador</Button>
        </div>
      </form>
      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent
          title="Conceder acesso de administrador?"
          description="Esta pessoa receberá acesso total à moderação e aos contatos dos proponentes. Ela precisa já ter conta criada em /participar com o e-mail verificado. A concessão fica registrada na auditoria com seu usuário e horário."
        >
          <div className="flex flex-wrap gap-2">
            <Button loading={busy} loadingText="Concedendo…" onClick={() => void confirm()}>
              Conceder e registrar
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              Cancelar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
