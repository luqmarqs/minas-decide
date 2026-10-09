import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { PageShell } from '@/components/layouts/PageShell';
import { ButtonLink } from '@/components/ui/Button';
import { LoadingBlock } from '@/components/ui/Skeleton';
import { ErrorState, Note } from '@/components/ui/States';
import { safeRedirectPath } from '@/lib/auth';
import {
  confirmAndRefresh,
  processAuthReturn,
  scrubAuthUrl,
  type ReturnOutcome,
} from '@/features/auth/authReturn';
import { SendLinkForm } from '@/features/auth/SendLinkForm';

const NEXT_LABEL: Record<string, string> = {
  '/criar-atividade': 'Continuar para criar a atividade',
  '/minhas-atividades': 'Ir para minhas atividades',
  '/': 'Ir para o mapa',
};

export default function AuthRetornoPage() {
  const queryClient = useQueryClient();
  const started = useRef<Promise<ReturnOutcome> | null>(null);
  const [outcome, setOutcome] = useState<ReturnOutcome | null>(null);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    let alive = true;
    if (!started.current) {
      // Read once, then wipe tokens from the address bar/history before anything else.
      const href = window.location.href;
      scrubAuthUrl();
      started.current = processAuthReturn(href);
    }
    void started.current.then((o) => {
      if (!alive) return;
      queryClient.removeQueries({ queryKey: ['me'] });
      setOutcome(o);
    });
    return () => {
      alive = false;
    };
  }, [queryClient]);

  async function retryConfirm() {
    setRetrying(true);
    const o = await confirmAndRefresh('/');
    queryClient.removeQueries({ queryKey: ['me'] });
    setOutcome(o);
    setRetrying(false);
  }

  return (
    <PageShell title="Verificando seu acesso" documentTitle="Verificando acesso">
      <meta name="robots" content="noindex, nofollow" />
      <meta name="referrer" content="no-referrer" />
      <div aria-live="polite">
        {!outcome ? <LoadingBlock label="Confirmando o link do e-mail…" lines={2} /> : null}
        {outcome?.status === 'success' ? <Success next={outcome.next} /> : null}
        {outcome?.status === 'expired' ? (
          <Failure
            title="Este link expirou ou já foi usado"
            text="Links de acesso valem por pouco tempo e só uma vez. Peça um novo abaixo."
          />
        ) : null}
        {outcome?.status === 'invalid' ? (
          <Failure
            title="Link inválido"
            text={
              outcome.reason === 'other_browser'
                ? 'Abra o link no mesmo navegador em que você o pediu, ou peça um novo abaixo.'
                : outcome.reason === 'no_params'
                  ? 'Esta página só funciona a partir do link enviado por e-mail.'
                  : 'O link não foi aceito. Peça um novo abaixo.'
            }
          />
        ) : null}
        {outcome?.status === 'unconfirmed' ? (
          <Failure title="E-mail ainda não confirmado" text={outcome.message} />
        ) : null}
        {outcome?.status === 'error' ? (
          <div className="flex flex-col gap-6">
            <ErrorState
              title="Não foi possível concluir a confirmação"
              message={outcome.message}
              onRetry={outcome.canRetry ? () => void retryConfirm() : undefined}
              retrying={retrying}
            />
            {!outcome.canRetry ? <SendLinkForm idPrefix="retorno-link" /> : null}
          </div>
        ) : null}
      </div>
    </PageShell>
  );
}

function Success({ next }: { next: string }) {
  const target = safeRedirectPath(next);
  return (
    <div className="flex flex-col gap-4">
      <Note>
        E-mail confirmado. Sua sessão neste navegador agora é de uma conta verificada: você pode
        organizar atividades. Sessões antigas em outros aparelhos foram encerradas por segurança.
      </Note>
      <div className="flex flex-wrap gap-2">
        <ButtonLink to={target} replace>
          {NEXT_LABEL[target] ?? 'Continuar'}
        </ButtonLink>
        {target !== '/minhas-atividades' ? (
          <ButtonLink to="/minhas-atividades" variant="secondary">
            Minhas atividades
          </ButtonLink>
        ) : null}
      </div>
    </div>
  );
}

function Failure({ title, text }: { title: string; text: string }) {
  return (
    <div className="flex flex-col gap-6">
      <div role="alert" className="rounded-md border border-warning/40 bg-warning-soft p-4">
        <p className="font-semibold">{title}</p>
        <p className="mt-1 text-secondary">{text}</p>
      </div>
      <SendLinkForm idPrefix="retorno-link" title="Pedir um novo link" />
      <div>
        <ButtonLink to="/" variant="ghost">
          Voltar ao mapa
        </ButtonLink>
      </div>
    </div>
  );
}
