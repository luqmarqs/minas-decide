import { useState } from 'react';
import type { MyActivity } from '@shared/contracts/activities.ts';
import { PageShell } from '@/components/layouts/PageShell';
import { ButtonLink } from '@/components/ui/Button';
import { LoadingBlock } from '@/components/ui/Skeleton';
import { ErrorState, Note } from '@/components/ui/States';
import { messageForError } from '@/lib/api';
import { formatActivityWhen } from '@/lib/format';
import { useMe, useSession } from '@/lib/auth';
import { ActivityEditor } from '@/features/activities/ActivityEditor';
import { SignedOutPanel } from '@/features/auth/SignedOutPanel';

const NEXT = '/criar-atividade';

export default function CriarAtividadePage() {
  const session = useSession();
  const me = useMe(session.status === 'active' ? session.session : null);
  const [saved, setSaved] = useState<MyActivity | null>(null);

  let body;
  if (saved) {
    body = (
      <section
        role="status"
        aria-labelledby="act-sent"
        className="flex flex-col gap-3 rounded-md border border-success/40 bg-success-soft p-4"
      >
        <h2 id="act-sent" className="font-body text-xl font-semibold tracking-normal">
          Atividade enviada para análise
        </h2>
        <p>
          “{saved.title}” — {formatActivityWhen(saved.starts_at, saved.ends_at)}. A equipe vai
          revisar antes de publicar no mapa e na agenda. <strong>Ainda não está pública.</strong>
        </p>
        <div className="flex flex-wrap gap-2">
          <ButtonLink to="/minhas-atividades">Acompanhar em Minhas atividades</ButtonLink>
          <ButtonLink to="/" variant="secondary">
            Voltar ao mapa
          </ButtonLink>
        </div>
      </section>
    );
  } else if (session.status === 'loading' || (session.status === 'active' && me.isLoading)) {
    body = <LoadingBlock label="Verificando sua sessão…" lines={3} />;
  } else if (session.status === 'unconfigured') {
    body = (
      <Note tone="warning">
        Login não configurado neste ambiente: não é possível criar atividades.
      </Note>
    );
  } else if (session.status === 'none') {
    body = (
      <SignedOutPanel next={NEXT}>
        Para organizar uma atividade é preciso entrar com a sua conta (e-mail verificado por
        código). Assim a equipe sabe com quem falar, e o mapa não recebe propostas anônimas.
      </SignedOutPanel>
    );
  } else if (me.error) {
    body = (
      <ErrorState
        title="Não foi possível verificar sua conta"
        message={messageForError(me.error)}
        onRetry={() => void me.refetch()}
        retrying={me.isFetching}
      />
    );
  } else if (me.data?.account_state === 'suspended') {
    body = <Note tone="warning">Sua conta está suspensa e não pode propor atividades.</Note>;
  } else {
    body = <ActivityEditor mode="create" draftOwner={me.data?.user_id} onSaved={setSaved} />;
  }

  return (
    <PageShell
      title="Propor uma atividade da campanha"
      lead="Panfletagem, encontro, caminhada… mobilize sua região pela campanha de Lula. A atividade é revisada antes de aparecer no mapa."
    >
      {body}
    </PageShell>
  );
}
