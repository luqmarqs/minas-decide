import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { PageShell } from '@/components/layouts/PageShell';
import { Button } from '@/components/ui/Button';
import { Dialog, DialogContent } from '@/components/ui/Dialog';
import { LoadingBlock } from '@/components/ui/Skeleton';
import { ErrorState, Note } from '@/components/ui/States';
import { messageForError } from '@/lib/api';
import { formatDateNumeric } from '@/lib/format';
import { useMe, useSession } from '@/lib/auth';
import {
  enrollTotp,
  getAssurance,
  groupSecret,
  listTotpFactors,
  MfaError,
  needsStepUp,
  unenrollFactor,
  verifyTotp,
  type TotpEnrollment,
  type TotpFactor,
} from '@/features/auth/mfa';
import { OtpField } from '@/features/auth/MfaGate';
import { SendLinkForm } from '@/features/auth/SendLinkForm';

const NEXT = '/conta/seguranca';
const mfaKey = (userId: string) => ['mfa', userId] as const;

/** /conta/seguranca — TOTP enrolment, list and removal (P-AUTH-1). */
export default function ContaSegurancaPage() {
  const session = useSession();
  const active = session.status === 'active' ? session.session : null;
  const me = useMe(active);

  let body;
  if (session.status === 'loading' || (active && me.isLoading)) {
    body = <LoadingBlock label="Verificando sua sessão…" lines={3} />;
  } else if (session.status === 'unconfigured') {
    body = <Note tone="warning">Login não configurado neste ambiente.</Note>;
  } else if (!active) {
    body = (
      <div className="flex flex-col gap-6">
        <Note>Entre com o link enviado por e-mail para configurar a segurança da sua conta.</Note>
        <SendLinkForm idPrefix="seg-link" next={NEXT} title="Entrar por e-mail" />
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
  } else if (!me.data?.email_verified) {
    body = (
      <div className="flex flex-col gap-6">
        <Note tone="warning">
          A verificação em duas etapas só pode ser ativada em contas com e-mail confirmado.
        </Note>
        <SendLinkForm idPrefix="seg-link" next={NEXT} title="Confirmar e-mail" />
      </div>
    );
  } else {
    body = <SecuritySettings userId={active.user.id} />;
  }

  return (
    <PageShell
      title="Segurança da conta"
      documentTitle="Segurança da conta"
      lead="Verificação em duas etapas com um app autenticador (Google Authenticator, Aegis, 1Password, Microsoft Authenticator…)."
    >
      <meta name="robots" content="noindex, nofollow" />
      {body}
    </PageShell>
  );
}

function SecuritySettings({ userId }: { userId: string }) {
  const queryClient = useQueryClient();
  const q = useQuery({
    queryKey: mfaKey(userId),
    staleTime: 0,
    gcTime: 0,
    retry: false,
    queryFn: async () => ({ factors: await listTotpFactors(), assurance: await getAssurance() }),
  });
  const [enrolling, setEnrolling] = useState(false);
  const [removing, setRemoving] = useState<TotpFactor | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const refresh = () => queryClient.invalidateQueries({ queryKey: mfaKey(userId) });

  if (q.isLoading) return <LoadingBlock label="Carregando fatores…" lines={3} />;
  if (q.error || !q.data) {
    return (
      <ErrorState
        title="Não foi possível carregar a configuração"
        message={q.error instanceof Error ? q.error.message : undefined}
        onRetry={() => void q.refetch()}
        retrying={q.isFetching}
      />
    );
  }
  const verified = q.data.factors.filter((f) => f.status === 'verified');
  const level = q.data.assurance.current;

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="seg-status" className="flex flex-col gap-2">
        <h2 id="seg-status" className="text-xl">
          Situação
        </h2>
        <p>
          {verified.length ? (
            <>
              Verificação em duas etapas <strong>ativa</strong>. Esta sessão está em nível{' '}
              <strong>{level === 'aal2' ? 'verificado com código' : 'só com e-mail'}</strong>.
            </>
          ) : (
            <>
              Verificação em duas etapas <strong>desativada</strong>. Recomendada para quem modera
              ou organiza atividades; obrigatória para a moderação.
            </>
          )}
        </p>
        {message ? (
          <p role="status" className="text-sm font-medium">
            {message}
          </p>
        ) : null}
      </section>

      {verified.length ? (
        <section aria-labelledby="seg-factors" className="flex flex-col gap-2">
          <h2 id="seg-factors" className="text-xl">
            Autenticadores
          </h2>
          <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
            {verified.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                <div>
                  <p className="font-semibold">{f.friendlyName ?? 'App autenticador'}</p>
                  <p className="text-sm text-muted">Ativado em {formatDateNumeric(f.createdAt)}</p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => setRemoving(f)}>
                  Remover
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {enrolling ? (
        <Enrolment
          onCancel={() => {
            setEnrolling(false);
            void refresh();
          }}
          onDone={() => {
            setEnrolling(false);
            setMessage(
              'Autenticador ativado. A partir de agora pediremos o código nas áreas protegidas.',
            );
            void queryClient.invalidateQueries();
          }}
        />
      ) : !verified.length ? (
        <div>
          <Button
            onClick={() => {
              setMessage(null);
              setEnrolling(true);
            }}
          >
            Ativar verificação em duas etapas
          </Button>
        </div>
      ) : null}

      {removing ? (
        <RemoveFactorDialog
          factor={removing}
          needsCode={needsStepUp(q.data.assurance)}
          onClose={() => setRemoving(null)}
          onRemoved={() => {
            setRemoving(null);
            setMessage('Autenticador removido. A verificação em duas etapas está desativada.');
            void refresh();
          }}
        />
      ) : null}
    </div>
  );
}

function Enrolment({ onCancel, onDone }: { onCancel: () => void; onDone: () => void }) {
  const [enrollment, setEnrollment] = useState<TotpEnrollment | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    enrollTotp()
      .then((e) => alive && setEnrollment(e))
      .catch((err: unknown) => {
        if (alive)
          setLoadError(err instanceof MfaError ? err.message : 'Não foi possível iniciar.');
      });
    return () => {
      alive = false;
    };
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!enrollment || busy) return;
    setBusy(true);
    setError(null);
    try {
      await verifyTotp(enrollment.factorId, code);
      onDone();
    } catch (err) {
      setError(err instanceof MfaError ? err.message : 'Não foi possível verificar o código.');
      document.getElementById('seg-code')?.focus();
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    // An abandoned enrolment leaves an unverified factor: remove it.
    if (enrollment) await unenrollFactor(enrollment.factorId).catch(() => undefined);
    onCancel();
  }

  if (loadError) {
    return <ErrorState title="Não foi possível iniciar a ativação" message={loadError} />;
  }
  if (!enrollment) return <LoadingBlock label="Gerando chave do autenticador…" lines={4} />;

  return (
    <section
      aria-labelledby="seg-enrol"
      className="flex flex-col gap-4 rounded-md border border-border-strong bg-surface-raised p-4"
    >
      <h2 id="seg-enrol" className="text-xl">
        Ativar com um app autenticador
      </h2>
      <ol className="flex list-decimal flex-col gap-3 pl-5">
        <li>
          Escaneie o QR code com o app autenticador.
          <img
            src={enrollment.qrDataUrl}
            alt="QR code com a chave do autenticador para Minas Decide"
            width={192}
            height={192}
            className="mt-2 size-48 rounded-sm border border-border bg-white p-2"
          />
        </li>
        <li>
          Sem câmera? Digite esta chave no app (tipo “baseada em tempo”):
          <p className="mt-1 font-mono text-base break-all" aria-label="Chave secreta">
            {groupSecret(enrollment.secret)}
          </p>
          <div className="mt-1 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                void navigator.clipboard
                  ?.writeText(enrollment.secret)
                  .then(() => setCopied(true))
                  .catch(() => setCopied(false));
              }}
            >
              {copied ? 'Chave copiada' : 'Copiar chave'}
            </Button>
            <a
              href={enrollment.uri}
              className="inline-flex min-h-11 items-center text-sm underline"
            >
              Abrir no app autenticador (celular)
            </a>
          </div>
        </li>
        <li>
          Digite o código de 6 números que o app mostrar.
          <form noValidate onSubmit={onSubmit} className="mt-2 flex flex-col gap-3">
            <OtpField id="seg-code" value={code} onChange={setCode} error={error} />
            <div className="flex flex-wrap gap-2">
              <Button type="submit" loading={busy} loadingText="Verificando…">
                Verificar e ativar
              </Button>
              <Button variant="ghost" onClick={() => void cancel()} disabled={busy}>
                Cancelar
              </Button>
            </div>
          </form>
        </li>
      </ol>
      <p className="text-sm text-muted">
        A chave é mostrada só agora. Se perder o acesso ao app, peça à equipe para remover o fator.
      </p>
    </section>
  );
}

function RemoveFactorDialog({
  factor,
  needsCode,
  onClose,
  onRemoved,
}: {
  factor: TotpFactor;
  needsCode: boolean;
  onClose: () => void;
  onRemoved: () => void;
}) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      // Supabase only removes a verified factor from an aal2 session.
      if (needsCode) await verifyTotp(factor.id, code);
      await unenrollFactor(factor.id);
      onRemoved();
    } catch (err) {
      setError(err instanceof MfaError ? err.message : 'Não foi possível remover agora.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title="Remover autenticador?"
        description="Sem ele, a sua conta volta a depender só do e-mail e a moderação fica bloqueada até ativar de novo."
      >
        <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
          {needsCode ? (
            <OtpField
              id="seg-remove-code"
              value={code}
              onChange={setCode}
              error={error}
              label="Confirme com o código atual do app"
            />
          ) : error ? (
            <p role="alert" className="text-sm text-error">
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="danger" loading={busy} loadingText="Removendo…">
              Remover autenticador
            </Button>
            <Button variant="ghost" onClick={onClose} disabled={busy}>
              Manter
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
